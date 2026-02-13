-- Simplificar campos de preço: remover PF/PJ, manter apenas price_single, price_kit, price_subscription
-- Também corrigir RLS do Storage para permitir uploads por admins

-- 1. Adicionar novas colunas simplificadas (se não existirem)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_single numeric NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_subscription numeric NOT NULL DEFAULT 0;

-- 2. Migrar dados das colunas antigas para as novas (usar PF como base)
UPDATE public.products SET 
  price_single = COALESCE(price_pf_single, 0),
  price_subscription = COALESCE(price_pf_subscription, 0)
WHERE price_single = 0;

-- 3. Remover colunas antigas PF/PJ
ALTER TABLE public.products DROP COLUMN IF EXISTS price_pf_single;
ALTER TABLE public.products DROP COLUMN IF EXISTS price_pj_single;
ALTER TABLE public.products DROP COLUMN IF EXISTS price_pf_subscription;
ALTER TABLE public.products DROP COLUMN IF EXISTS price_pj_subscription;

-- 4. Corrigir RLS do Storage - Remover policies antigas e criar novas mais permissivas
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

-- Criar policies que verificam se o usuário está autenticado E é admin
-- Usando auth.uid() IS NOT NULL junto com is_admin() para garantir funcionamento
CREATE POLICY "Authenticated admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
  AND is_admin()
);

CREATE POLICY "Authenticated admins can update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
  AND is_admin()
);

CREATE POLICY "Authenticated admins can delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
  AND is_admin()
);