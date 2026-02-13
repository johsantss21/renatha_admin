
-- Add payment_url and pix_copia_e_cola columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_url text,
ADD COLUMN IF NOT EXISTS pix_copia_e_cola text;

-- Add payment_url to subscriptions for subscription payments
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS payment_url text,
ADD COLUMN IF NOT EXISTS pix_copia_e_cola text,
ADD COLUMN IF NOT EXISTS pix_transaction_id text;
