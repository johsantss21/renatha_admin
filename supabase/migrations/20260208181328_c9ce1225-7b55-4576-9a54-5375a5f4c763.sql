-- Fix permissive RLS policies that allow anonymous access to sensitive tables

-- customers (PII)
DROP POLICY IF EXISTS "Anon can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can read customers" ON public.customers;

-- orders
DROP POLICY IF EXISTS "Anon can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Anon can read orders" ON public.orders;
DROP POLICY IF EXISTS "Anon can update orders" ON public.orders;

-- order_items
DROP POLICY IF EXISTS "Anon can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Anon can read order items" ON public.order_items;

-- subscriptions
DROP POLICY IF EXISTS "Anon can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Anon can read subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Anon can update subscriptions" ON public.subscriptions;

-- subscription_items
DROP POLICY IF EXISTS "Anon can insert subscription items" ON public.subscription_items;
DROP POLICY IF EXISTS "Anon can read subscription items" ON public.subscription_items;

-- subscription_deliveries
DROP POLICY IF EXISTS "Anon can read subscription deliveries" ON public.subscription_deliveries;
