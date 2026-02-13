-- Tabela de perfis de operadores
CREATE TABLE public.operator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Dados pessoais
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  -- Dados da empresa
  company_name TEXT NOT NULL,
  trading_name TEXT,
  cnpj TEXT NOT NULL UNIQUE,
  company_email TEXT,
  company_phone TEXT,
  -- Endereço da empresa
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  -- Dados de validação
  cnpj_validated BOOLEAN NOT NULL DEFAULT false,
  cnpj_validation_data JSONB,
  cpf_validated BOOLEAN NOT NULL DEFAULT false,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.operator_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view own profile"
  ON public.operator_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.operator_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.operator_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.operator_profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all profiles"
  ON public.operator_profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER update_operator_profiles_updated_at
  BEFORE UPDATE ON public.operator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_operator_profiles_user_id ON public.operator_profiles(user_id);
CREATE INDEX idx_operator_profiles_cnpj ON public.operator_profiles(cnpj);
CREATE INDEX idx_operator_profiles_cpf ON public.operator_profiles(cpf);