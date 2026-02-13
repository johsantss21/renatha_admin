-- ============================================
-- 1. CLIENTES: Adicionar campos para PJ (Responsável e Contato)
-- ============================================
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS trading_name text,
ADD COLUMN IF NOT EXISTS responsible_name text,
ADD COLUMN IF NOT EXISTS responsible_contact text;

-- Comentários para documentação
COMMENT ON COLUMN public.customers.trading_name IS 'Nome Fantasia (apenas PJ)';
COMMENT ON COLUMN public.customers.responsible_name IS 'Nome do responsável (apenas PJ)';
COMMENT ON COLUMN public.customers.responsible_contact IS 'Contato do responsável - telefone ou email (apenas PJ)';

-- ============================================
-- 2. PEDIDOS: Adicionar configuração de quantidade mínima para kit
-- e campos para cancelamento
-- ============================================
-- Tabela de configurações do sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Policy para admins
CREATE POLICY "Admins can manage settings"
ON public.system_settings
FOR ALL
USING (is_admin());

-- Inserir configuração padrão de quantidade mínima para kit
INSERT INTO public.system_settings (key, value, description)
VALUES ('kit_min_quantity', '3', 'Quantidade mínima de itens para aplicar preço de kit')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 3. PEDIDOS: Campos para cancelamento com autenticação
-- ============================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelled_by uuid,
ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Tabela de log de cancelamentos
CREATE TABLE IF NOT EXISTS public.order_cancellation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cancelled_by uuid NOT NULL,
  cancelled_by_email text NOT NULL,
  reason text,
  previous_payment_status text NOT NULL,
  previous_delivery_status text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.order_cancellation_logs ENABLE ROW LEVEL SECURITY;

-- Policy para admins
CREATE POLICY "Admins can manage cancellation logs"
ON public.order_cancellation_logs
FOR ALL
USING (is_admin());

-- Adicionar status 'cancelado' aos enums se não existir
DO $$ 
BEGIN
  -- Verificar se 'cancelado' já existe no enum payment_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'cancelado' 
    AND enumtypid = 'payment_status'::regtype
  ) THEN
    ALTER TYPE payment_status ADD VALUE 'cancelado';
  END IF;
END $$;

DO $$ 
BEGIN
  -- Verificar se 'cancelado' já existe no enum delivery_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'cancelado' 
    AND enumtypid = 'delivery_status'::regtype
  ) THEN
    ALTER TYPE delivery_status ADD VALUE 'cancelado';
  END IF;
END $$;