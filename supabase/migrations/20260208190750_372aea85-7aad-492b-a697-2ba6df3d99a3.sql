-- 1. Adicionar novos campos à tabela products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS stock_min integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS stock_max integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS price_kit numeric NOT NULL DEFAULT 0;

-- 2. Renomear stock_available para stock (estoque atual)
-- Primeiro verificar se já existe a coluna stock
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'stock_available') THEN
    ALTER TABLE public.products RENAME COLUMN stock_available TO stock;
  END IF;
END $$;

-- 3. Criar bucket para imagens de produtos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 
  'product-images', 
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS para storage - permitir leitura pública
CREATE POLICY "Product images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'product-images');

-- 5. RLS para storage - admins podem fazer upload
CREATE POLICY "Admins can upload product images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

-- 6. RLS para storage - admins podem atualizar
CREATE POLICY "Admins can update product images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'product-images' AND public.is_admin());

-- 7. RLS para storage - admins podem deletar
CREATE POLICY "Admins can delete product images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'product-images' AND public.is_admin());

-- 8. Comentários para documentar os campos
COMMENT ON COLUMN public.products.stock IS 'Estoque atual disponível';
COMMENT ON COLUMN public.products.stock_min IS 'Estoque mínimo para alerta';
COMMENT ON COLUMN public.products.stock_max IS 'Estoque máximo de referência';
COMMENT ON COLUMN public.products.price_kit IS 'Preço para venda em kit';
COMMENT ON COLUMN public.products.price_pf_single IS 'Preço unitário pessoa física (avulso)';
COMMENT ON COLUMN public.products.price_pj_single IS 'Preço unitário pessoa jurídica (avulso)';
COMMENT ON COLUMN public.products.price_pf_subscription IS 'Preço pessoa física para assinatura';
COMMENT ON COLUMN public.products.price_pj_subscription IS 'Preço pessoa jurídica para assinatura';