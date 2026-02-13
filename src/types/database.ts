// Tipos do banco de dados
export type CustomerType = 'PF' | 'PJ';
export type PaymentStatus = 'pendente' | 'confirmado' | 'recusado' | 'cancelado';
export type DeliveryStatus = 'aguardando' | 'em_rota' | 'entregue' | 'cancelado';
export type SubscriptionStatus = 'ativa' | 'pausada' | 'cancelada';
export type SubscriptionFrequency = 'diaria' | 'semanal' | 'quinzenal' | 'mensal';
export type Weekday = 'domingo' | 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado';
export type TimeSlot = 'manha' | 'tarde';
export type PaymentMethod = 'pix' | 'cartao' | 'boleto' | 'stripe';

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  images: string[];
  price_single: number;
  price_kit: number;
  price_subscription: number;
  stock: number;
  stock_min: number;
  stock_max: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  customer_type: CustomerType;
  cpf_cnpj: string;
  email: string | null;
  phone: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  trading_name: string | null;
  responsible_name: string | null;
  responsible_contact: string | null;
  validated: boolean;
  validation_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer?: Customer;
  total_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  delivery_status: DeliveryStatus;
  delivery_date: string | null;
  delivery_time_slot: TimeSlot | null;
  payment_confirmed_at: string | null;
  stripe_payment_intent_id: string | null;
  pix_transaction_id: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export interface OrderCancellationLog {
  id: string;
  order_id: string;
  cancelled_by: string;
  cancelled_by_email: string;
  reason: string | null;
  previous_payment_status: string;
  previous_delivery_status: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  subscription_number: string;
  customer_id: string;
  customer?: Customer;
  delivery_weekday: Weekday;
  delivery_time_slot: TimeSlot | string;
  frequency: SubscriptionFrequency | null;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  next_delivery_date: string | null;
  total_amount: number;
  notes: string | null;
  is_emergency: boolean;
  delivery_weekdays: string[] | null;
  created_at: string;
  updated_at: string;
  items?: SubscriptionItem[];
}

export interface SubscriptionItem {
  id: string;
  subscription_id: string;
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  reserved_stock: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionDelivery {
  id: string;
  subscription_id: string;
  delivery_date: string;
  delivery_status: DeliveryStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  created_at: string;
  updated_at: string;
}
