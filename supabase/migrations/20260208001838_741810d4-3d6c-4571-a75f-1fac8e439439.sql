-- Criar enum para tipo de cliente
CREATE TYPE public.customer_type AS ENUM ('PF', 'PJ');

-- Criar enum para status de pagamento
CREATE TYPE public.payment_status AS ENUM ('pendente', 'confirmado', 'recusado');

-- Criar enum para status de entrega
CREATE TYPE public.delivery_status AS ENUM ('aguardando', 'em_rota', 'entregue');

-- Criar enum para status de assinatura
CREATE TYPE public.subscription_status AS ENUM ('ativa', 'pausada', 'cancelada');

-- Criar enum para dia da semana
CREATE TYPE public.weekday AS ENUM ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado');

-- Criar enum para faixa de horário
CREATE TYPE public.time_slot AS ENUM ('manha', 'tarde');

-- Criar enum para forma de pagamento
CREATE TYPE public.payment_method AS ENUM ('pix', 'cartao', 'boleto', 'stripe');

-- ===========================================
-- TABELA: PRODUTOS
-- ===========================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE DEFAULT 'PROD-' || substring(gen_random_uuid()::text, 1, 8),
  name TEXT NOT NULL,
  description TEXT,
  images TEXT[] DEFAULT '{}',
  price_pf_single DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_pj_single DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_pf_subscription DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_pj_subscription DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_available INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: CLIENTES
-- ===========================================
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  customer_type public.customer_type NOT NULL DEFAULT 'PF',
  cpf_cnpj TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT NOT NULL,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  bank_pix_key TEXT,
  validated BOOLEAN NOT NULL DEFAULT false,
  validation_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: PEDIDOS AVULSOS
-- ===========================================
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE DEFAULT 'ORD-' || substring(gen_random_uuid()::text, 1, 8),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method,
  payment_status public.payment_status NOT NULL DEFAULT 'pendente',
  delivery_status public.delivery_status NOT NULL DEFAULT 'aguardando',
  delivery_date DATE,
  delivery_time_slot public.time_slot,
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  stripe_payment_intent_id TEXT,
  pix_transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: ITENS DO PEDIDO
-- ===========================================
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: ASSINATURAS
-- ===========================================
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_number TEXT NOT NULL UNIQUE DEFAULT 'SUB-' || substring(gen_random_uuid()::text, 1, 8),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  delivery_weekday public.weekday NOT NULL,
  delivery_time_slot public.time_slot NOT NULL DEFAULT 'manha',
  status public.subscription_status NOT NULL DEFAULT 'ativa',
  stripe_subscription_id TEXT,
  next_delivery_date DATE,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: ITENS DA ASSINATURA
-- ===========================================
CREATE TABLE public.subscription_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  reserved_stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: HISTÓRICO DE ENTREGAS DE ASSINATURA
-- ===========================================
CREATE TABLE public.subscription_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  delivery_status public.delivery_status NOT NULL DEFAULT 'aguardando',
  payment_status public.payment_status NOT NULL DEFAULT 'pendente',
  total_amount DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- TABELA: PERFIS DE ADMIN
-- ===========================================
CREATE TABLE public.admin_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ===========================================
-- FUNÇÃO: Atualizar updated_at
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ===========================================
-- TRIGGERS: updated_at
-- ===========================================
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_items_updated_at
  BEFORE UPDATE ON public.subscription_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_deliveries_updated_at
  BEFORE UPDATE ON public.subscription_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- FUNÇÃO: Calcular data de entrega automática
-- ===========================================
CREATE OR REPLACE FUNCTION public.calculate_delivery_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'confirmado' AND OLD.payment_status != 'confirmado' THEN
    NEW.payment_confirmed_at = now();
    
    -- Se confirmado até 12h, entrega no mesmo dia à tarde
    IF EXTRACT(HOUR FROM now()) < 12 THEN
      NEW.delivery_date = CURRENT_DATE;
      NEW.delivery_time_slot = 'tarde';
    ELSE
      -- Se confirmado após 12h, entrega no dia seguinte pela manhã
      NEW.delivery_date = CURRENT_DATE + 1;
      NEW.delivery_time_slot = 'manha';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER calculate_order_delivery_date
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.calculate_delivery_date();

-- ===========================================
-- RLS: Habilitar para todas as tabelas
-- ===========================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- FUNÇÃO: Verificar se usuário é admin
-- ===========================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = auth.uid() AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================
-- RLS POLICIES: Produtos (admins podem tudo, API pode ler)
-- ===========================================
CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read active products"
  ON public.products FOR SELECT
  USING (active = true);

-- ===========================================
-- RLS POLICIES: Clientes (admins podem tudo)
-- ===========================================
CREATE POLICY "Admins can manage customers"
  ON public.customers FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read customers"
  ON public.customers FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert customers"
  ON public.customers FOR INSERT
  WITH CHECK (true);

-- ===========================================
-- RLS POLICIES: Pedidos (admins podem tudo)
-- ===========================================
CREATE POLICY "Admins can manage orders"
  ON public.orders FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read orders"
  ON public.orders FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon can update orders"
  ON public.orders FOR UPDATE
  USING (true);

-- ===========================================
-- RLS POLICIES: Itens do Pedido
-- ===========================================
CREATE POLICY "Admins can manage order items"
  ON public.order_items FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read order items"
  ON public.order_items FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert order items"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

-- ===========================================
-- RLS POLICIES: Assinaturas
-- ===========================================
CREATE POLICY "Admins can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read subscriptions"
  ON public.subscriptions FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon can update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (true);

-- ===========================================
-- RLS POLICIES: Itens da Assinatura
-- ===========================================
CREATE POLICY "Admins can manage subscription items"
  ON public.subscription_items FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read subscription items"
  ON public.subscription_items FOR SELECT
  USING (true);

CREATE POLICY "Anon can insert subscription items"
  ON public.subscription_items FOR INSERT
  WITH CHECK (true);

-- ===========================================
-- RLS POLICIES: Entregas de Assinatura
-- ===========================================
CREATE POLICY "Admins can manage subscription deliveries"
  ON public.subscription_deliveries FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anon can read subscription deliveries"
  ON public.subscription_deliveries FOR SELECT
  USING (true);

-- ===========================================
-- RLS POLICIES: Admin Profiles
-- ===========================================
CREATE POLICY "Admins can view all profiles"
  ON public.admin_profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Users can view own profile"
  ON public.admin_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage profiles"
  ON public.admin_profiles FOR ALL
  USING (public.is_admin());

-- ===========================================
-- ÍNDICES
-- ===========================================
CREATE INDEX idx_products_code ON public.products(code);
CREATE INDEX idx_products_active ON public.products(active);
CREATE INDEX idx_customers_cpf_cnpj ON public.customers(cpf_cnpj);
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(payment_status, delivery_status);
CREATE INDEX idx_orders_delivery_date ON public.orders(delivery_date);
CREATE INDEX idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_weekday ON public.subscriptions(delivery_weekday);