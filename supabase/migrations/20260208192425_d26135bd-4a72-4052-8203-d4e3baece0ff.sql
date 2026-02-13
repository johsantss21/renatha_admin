-- Atribuir role de admin ao primeiro usuário existente que ainda não tem role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.users.id
)
LIMIT 1
ON CONFLICT DO NOTHING;