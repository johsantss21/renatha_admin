
-- 1. Adicionar coluna is_emergency na tabela subscriptions para pedido emergencial PJ
ALTER TABLE public.subscriptions 
ADD COLUMN is_emergency boolean NOT NULL DEFAULT false;

-- 2. Adicionar coluna delivery_weekdays (array) para recorrência personalizada PJ
ALTER TABLE public.subscriptions 
ADD COLUMN delivery_weekdays text[] DEFAULT NULL;

-- 3. Corrigir a função calculate_delivery_date para ler hora_limite das configurações
-- e respeitar fins de semana e feriados
CREATE OR REPLACE FUNCTION public.calculate_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_hora_limite text;
  v_hora_limite_parts text[];
  v_hora_limite_hour int;
  v_hora_limite_min int;
  v_current_hour int;
  v_current_min int;
  v_current_time_mins int;
  v_limit_time_mins int;
  v_delivery_date date;
  v_feriados jsonb;
  v_dias_funcionamento jsonb;
BEGIN
  -- Só processar quando pagamento é confirmado
  IF NEW.payment_status = 'confirmado' AND OLD.payment_status != 'confirmado' THEN
    NEW.payment_confirmed_at = now();
    
    -- Buscar hora limite das configurações
    SELECT value::text INTO v_hora_limite
    FROM public.system_settings 
    WHERE key = 'hora_limite_entrega_dia';
    
    -- Default 12:00 se não configurado
    IF v_hora_limite IS NULL OR v_hora_limite = '' THEN
      v_hora_limite := '12:00';
    END IF;
    
    -- Remover aspas se vieram como JSON string
    v_hora_limite := trim(both '"' from v_hora_limite);
    
    -- Parse hora:minuto
    v_hora_limite_parts := string_to_array(v_hora_limite, ':');
    v_hora_limite_hour := v_hora_limite_parts[1]::int;
    v_hora_limite_min := COALESCE(v_hora_limite_parts[2]::int, 0);
    
    -- Horário atual em minutos
    v_current_hour := EXTRACT(HOUR FROM now())::int;
    v_current_min := EXTRACT(MINUTE FROM now())::int;
    v_current_time_mins := v_current_hour * 60 + v_current_min;
    v_limit_time_mins := v_hora_limite_hour * 60 + v_hora_limite_min;
    
    -- Buscar feriados das configurações
    SELECT value INTO v_feriados
    FROM public.system_settings 
    WHERE key = 'feriados';
    
    IF v_feriados IS NULL THEN
      v_feriados := '[]'::jsonb;
    END IF;
    
    -- Determinar data de entrega baseado no horário limite
    IF v_current_time_mins <= v_limit_time_mins THEN
      -- Confirmado antes ou no horário limite: entrega no mesmo dia (se for dia útil)
      v_delivery_date := CURRENT_DATE;
    ELSE
      -- Confirmado após horário limite: próximo dia
      v_delivery_date := CURRENT_DATE + 1;
    END IF;
    
    -- Avançar para o próximo dia útil (pular sábado, domingo e feriados)
    LOOP
      EXIT WHEN EXTRACT(DOW FROM v_delivery_date) NOT IN (0, 6) -- 0=domingo, 6=sábado
        AND NOT (v_feriados ? to_char(v_delivery_date, 'YYYY-MM-DD'));
      v_delivery_date := v_delivery_date + 1;
    END LOOP;
    
    NEW.delivery_date = v_delivery_date;
    -- Manter o time_slot escolhido pelo cliente, não sobrescrever
    IF NEW.delivery_time_slot IS NULL THEN
      IF v_current_time_mins <= v_limit_time_mins THEN
        NEW.delivery_time_slot = 'tarde';
      ELSE
        NEW.delivery_time_slot = 'manha';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 4. Garantir que o trigger existe na tabela orders
DROP TRIGGER IF EXISTS calculate_delivery_date_trigger ON public.orders;
CREATE TRIGGER calculate_delivery_date_trigger
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.calculate_delivery_date();
