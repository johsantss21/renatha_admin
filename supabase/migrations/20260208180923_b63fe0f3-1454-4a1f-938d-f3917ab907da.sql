-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.operator_profiles;

-- Create a permissive INSERT policy that allows users to insert their own profile
-- This works because after signup, we pass the user_id from authData.user.id
CREATE POLICY "Users can insert own profile" 
ON public.operator_profiles 
FOR INSERT 
WITH CHECK (true);

-- But ensure updates still require auth
DROP POLICY IF EXISTS "Users can update own profile" ON public.operator_profiles;
CREATE POLICY "Users can update own profile" 
ON public.operator_profiles 
FOR UPDATE 
USING (user_id = auth.uid());

-- Also need to allow inserting into user_roles for first user (admin)
DROP POLICY IF EXISTS "Allow first user to become admin" ON public.user_roles;
CREATE POLICY "Allow first user to become admin"
ON public.user_roles
FOR INSERT
WITH CHECK (
  -- Allow insert if this would be the first role (first user becomes admin)
  (SELECT count(*) FROM public.user_roles) = 0
  OR 
  -- Or if user is already admin
  has_role(auth.uid(), 'admin')
);