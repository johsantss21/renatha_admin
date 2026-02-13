
-- Change delivery_time_slot from enum time_slot to text in orders table
ALTER TABLE public.orders 
  ALTER COLUMN delivery_time_slot TYPE text USING delivery_time_slot::text;

-- Update any existing 'manha' values to a proper time slot
UPDATE public.orders SET delivery_time_slot = '08:00–09:00' WHERE delivery_time_slot = 'manha';
UPDATE public.orders SET delivery_time_slot = '12:00–13:00' WHERE delivery_time_slot = 'tarde';
