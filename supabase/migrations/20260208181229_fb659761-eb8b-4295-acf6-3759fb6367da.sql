-- Tighten RLS back up (PII table) and move onboarding inserts server-side via trigger on auth.users

-- 1) operator_profiles should NOT allow open INSERTs
DROP POLICY IF EXISTS "Users can insert own profile" ON public.operator_profiles;
CREATE POLICY "Users can insert own profile"
ON public.operator_profiles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Keep update restricted to owner (recreate to ensure correct)
DROP POLICY IF EXISTS "Users can update own profile" ON public.operator_profiles;
CREATE POLICY "Users can update own profile"
ON public.operator_profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- 2) user_roles should NOT allow bootstrap inserts from the client
DROP POLICY IF EXISTS "Allow first user to become admin" ON public.user_roles;

-- 3) ensure one operator profile per user
CREATE UNIQUE INDEX IF NOT EXISTS operator_profiles_user_id_uidx
ON public.operator_profiles(user_id);

-- 4) trigger: on signup, create operator profile + first admin role (server-side)
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_profile_type text;
  v_full_name text;
  v_cpf text;
  v_phone text;
  v_company_name text;
  v_cnpj text;
BEGIN
  v_profile_type := coalesce(NEW.raw_user_meta_data->>'profile_type', '');

  IF v_profile_type = 'operator' THEN
    v_full_name := coalesce(NEW.raw_user_meta_data->>'full_name', '');
    v_cpf := coalesce(NEW.raw_user_meta_data->>'cpf', '');
    v_phone := coalesce(NEW.raw_user_meta_data->>'phone', '');
    v_company_name := coalesce(NEW.raw_user_meta_data->>'company_name', '');
    v_cnpj := coalesce(NEW.raw_user_meta_data->>'cnpj', '');

    -- Basic server-side validation (avoid corrupt/empty required fields)
    IF v_full_name = '' OR v_cpf = '' OR v_phone = '' OR v_company_name = '' OR v_cnpj = '' THEN
      RAISE EXCEPTION 'Missing required onboarding fields';
    END IF;

    INSERT INTO public.operator_profiles (
      user_id,
      full_name,
      cpf,
      phone,
      company_name,
      trading_name,
      cnpj,
      company_email,
      company_phone,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      zip_code,
      cpf_validated,
      cnpj_validated
    ) VALUES (
      NEW.id,
      v_full_name,
      v_cpf,
      v_phone,
      v_company_name,
      NULLIF(NEW.raw_user_meta_data->>'trading_name', ''),
      v_cnpj,
      NULLIF(NEW.raw_user_meta_data->>'company_email', ''),
      NULLIF(NEW.raw_user_meta_data->>'company_phone', ''),
      NULLIF(NEW.raw_user_meta_data->>'street', ''),
      NULLIF(NEW.raw_user_meta_data->>'number', ''),
      NULLIF(NEW.raw_user_meta_data->>'complement', ''),
      NULLIF(NEW.raw_user_meta_data->>'neighborhood', ''),
      NULLIF(NEW.raw_user_meta_data->>'city', ''),
      NULLIF(NEW.raw_user_meta_data->>'state', ''),
      NULLIF(NEW.raw_user_meta_data->>'zip_code', ''),
      true,
      CASE
        WHEN NEW.raw_user_meta_data ? 'cnpj_validated' THEN (NEW.raw_user_meta_data->>'cnpj_validated')::boolean
        ELSE false
      END
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Bootstrap: first user to get a role becomes admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_onboarding ON auth.users;
CREATE TRIGGER on_auth_user_created_onboarding
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_onboarding();
