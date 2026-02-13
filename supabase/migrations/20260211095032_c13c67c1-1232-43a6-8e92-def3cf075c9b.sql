
-- Add Stripe subscription fields to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Add Pix recurring authorization fields to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pix_recorrencia_autorizada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_autorizacao_id text,
  ADD COLUMN IF NOT EXISTS pix_recorrencia_status text,
  ADD COLUMN IF NOT EXISTS pix_recorrencia_data_inicio timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pix_recorrencia_valor_mensal numeric;
