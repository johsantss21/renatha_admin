-- Criar enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Criar tabela de roles separada (melhor prática de segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Habilitar RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função security definer para verificar role (evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Atualizar função is_admin para usar a nova estrutura
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Políticas para user_roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Índice para performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);