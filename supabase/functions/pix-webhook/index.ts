import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const logStep = (step: string, details?: any) => {
  console.log(`[PIX-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// Utility: Calculate delivery date for ORDERS based on settings
async function calculateDeliveryDate(): Promise<{ delivery_date: string; delivery_time_slot: string }> {
  const now = new Date();
  const { data: settingsData } = await supabase.from("system_settings").select("*");
  const settingsMap = new Map(settingsData?.map((s: any) => [s.key, s.value]) || []);

  const getValue = (key: string, defaultValue: any) => {
    const val = settingsMap.get(key);
    if (val === undefined || val === null) return defaultValue;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
    return val;
  };

  const horaLimite: string = getValue('hora_limite_entrega_dia', '12:00');
  const feriados: string[] = getValue('feriados', []);
  const [limitHour, limitMin] = horaLimite.split(':').map(Number);
  const limitMinutes = limitHour * 60 + (limitMin || 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let deliveryDate: Date;
  let timeSlot: string;

  if (currentMinutes <= limitMinutes) {
    deliveryDate = new Date(now);
    timeSlot = 'tarde';
  } else {
    deliveryDate = new Date(now);
    deliveryDate.setDate(deliveryDate.getDate() + 1);
    timeSlot = 'manha';
  }

  while (true) {
    const dow = deliveryDate.getDay();
    const dateStr = deliveryDate.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !feriados.includes(dateStr)) break;
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }

  return { delivery_date: deliveryDate.toISOString().split('T')[0], delivery_time_slot: timeSlot };
}

// Calculate next delivery date for SUBSCRIPTIONS based on chosen weekday(s)
function calculateNextSubscriptionDelivery(deliveryWeekday: string, deliveryWeekdays: string[] | null): string {
  const weekdayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  };

  const targetDays = deliveryWeekdays && deliveryWeekdays.length > 0
    ? deliveryWeekdays.map(d => weekdayMap[d]).filter(d => d !== undefined)
    : [weekdayMap[deliveryWeekday]].filter(d => d !== undefined);

  if (targetDays.length === 0) targetDays.push(1);

  const today = new Date();
  const candidate = new Date(today);
  candidate.setDate(candidate.getDate() + 1);

  for (let i = 0; i < 7; i++) {
    if (targetDays.includes(candidate.getDay())) {
      return candidate.toISOString().split('T')[0];
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  candidate.setDate(today.getDate() + 7);
  return candidate.toISOString().split('T')[0];
}

serve(async (req) => {
  try {
    const body = await req.json();
    logStep("Pix webhook received", { body });

    const pixEvents = body.pix || [];

    for (const pixEvent of pixEvents) {
      const txid = pixEvent.txid;
      const valor = parseFloat(pixEvent.valor || '0');
      const endToEndId = pixEvent.endToEndId;

      logStep("Processing Pix event", { txid, valor, endToEndId });

      if (!txid) continue;

      // Find order with this pix_transaction_id
      const { data: orders } = await supabase.from('orders')
        .select('id, total_amount')
        .eq('pix_transaction_id', txid)
        .limit(1);

      if (orders && orders.length > 0) {
        const order = orders[0];
        // ORDERS: use hora_limite logic
        const delivery = await calculateDeliveryDate();

        await supabase.from('orders').update({
          payment_status: 'confirmado',
          payment_confirmed_at: new Date().toISOString(),
          delivery_date: delivery.delivery_date,
          delivery_time_slot: delivery.delivery_time_slot,
        }).eq('id', order.id);

        logStep("Order payment confirmed via Pix", { orderId: order.id, delivery });
      } else {
        // Check subscriptions
        const { data: subs } = await supabase.from('subscriptions')
          .select('id, delivery_weekday, delivery_weekdays, total_amount')
          .eq('pix_transaction_id', txid)
          .limit(1);

        if (subs && subs.length > 0) {
          const sub = subs[0];
          // SUBSCRIPTIONS: activate and schedule based on customer's chosen weekday(s)
          const nextDelivery = calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          await supabase.from('subscriptions').update({
            status: 'ativa',
            next_delivery_date: nextDelivery,
            pix_recorrencia_autorizada: true,
            pix_recorrencia_status: 'ativa',
            pix_recorrencia_data_inicio: new Date().toISOString(),
            pix_recorrencia_valor_mensal: sub.total_amount,
          }).eq('id', sub.id);

          logStep("Subscription activated via Pix with recurring flag", { subscriptionId: sub.id, nextDelivery });
        } else {
          logStep("No order or subscription found for txid", { txid });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});