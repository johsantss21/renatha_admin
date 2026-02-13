-- Change delivery_time_slot from enum to text to support custom time slots from settings
ALTER TABLE public.subscriptions 
  ALTER COLUMN delivery_time_slot TYPE text USING delivery_time_slot::text;

ALTER TABLE public.subscriptions 
  ALTER COLUMN delivery_time_slot SET DEFAULT 'manha';
