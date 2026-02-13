import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const logStep = (step: string, details?: any) => {
  console.log(`[PIX-AUTO-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

async function logAuditEvent(type: string, details: any) {
  await supabase.from('system_settings').upsert({
    key: `pix_auto_log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    value: { type, ...details, timestamp: new Date().toISOString() } as any,
    description: `Webhook Pix Automático: ${type}`,
  }, { onConflict: 'key' });
}

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

function generateMonthlyDeliveryDates(deliveryWeekday: string, deliveryWeekdays: string[] | null, count: number): string[] {
  const weekdayMap: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  };

  const targetDays = deliveryWeekdays && deliveryWeekdays.length > 0
    ? deliveryWeekdays.map(d => weekdayMap[d]).filter(d => d !== undefined)
    : [weekdayMap[deliveryWeekday]].filter(d => d !== undefined);

  if (targetDays.length === 0) targetDays.push(1);

  const dates: string[] = [];
  const candidate = new Date();
  candidate.setDate(candidate.getDate() + 1);

  // Generate up to `count` delivery dates within ~35 days
  for (let i = 0; i < 35 && dates.length < count; i++) {
    if (targetDays.includes(candidate.getDay())) {
      dates.push(candidate.toISOString().split('T')[0]);
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return dates;
}

async function findSubscription(identifier: string) {
  const { data: subs } = await supabase.from('subscriptions')
    .select('id, delivery_weekday, delivery_weekdays, total_amount, status, pix_transaction_id, pix_autorizacao_id')
    .or(`pix_transaction_id.eq.${identifier},pix_autorizacao_id.eq.${identifier}`)
    .limit(1);
  return subs && subs.length > 0 ? subs[0] : null;
}

serve(async (req) => {
  try {
    const body = await req.json();
    logStep("Webhook received", { body });

    // ======================================================================
    // Handle REC events (recurrence status changes - webhookrec)
    // Status: CRIADA → APROVADA → REJEITADA/CANCELADA
    // ======================================================================
    if (body.rec) {
      for (const recEvent of Array.isArray(body.rec) ? body.rec : [body.rec]) {
        const idRec = recEvent.idRec;
        const status = recEvent.status;
        logStep("REC event", { idRec, status });

        if (!idRec) continue;

        const sub = await findSubscription(idRec);
        if (!sub) {
          logStep("No subscription found for idRec", { idRec });
          await logAuditEvent('rec_event_no_sub', { idRec, status });
          continue;
        }

        if (status === 'APROVADA') {
          // Recurrence approved by the payer's bank
          await supabase.from('subscriptions').update({
            pix_recorrencia_autorizada: true,
            pix_recorrencia_status: 'ativa',
          }).eq('id', sub.id);
          logStep("Recurrence approved", { subscriptionId: sub.id });
          await logAuditEvent('rec_aprovada', { subscription_id: sub.id, idRec });

        } else if (status === 'REJEITADA' || status === 'CANCELADA') {
          await supabase.from('subscriptions').update({
            pix_recorrencia_autorizada: false,
            pix_recorrencia_status: status === 'REJEITADA' ? 'rejeitada' : 'cancelada',
          }).eq('id', sub.id);
          logStep("Recurrence rejected/cancelled", { subscriptionId: sub.id, status });
          await logAuditEvent('rec_rejeitada', { subscription_id: sub.id, idRec, status });
        }
      }
    }

    // ======================================================================
    // Handle COBR events (recurring charge events - webhookcobr)
    // These are future monthly charges after the recurrence is approved
    // ======================================================================
    if (body.cobr) {
      for (const cobrEvent of Array.isArray(body.cobr) ? body.cobr : [body.cobr]) {
        const idRec = cobrEvent.idRec;
        const txid = cobrEvent.txid;
        const status = cobrEvent.status;
        logStep("COBR event", { idRec, txid, status });

        if (!idRec) continue;

        const sub = await findSubscription(idRec);
        if (!sub) {
          logStep("No subscription found for cobr idRec", { idRec });
          await logAuditEvent('cobr_event_no_sub', { idRec, txid, status });
          continue;
        }

        if (status === 'LIQUIDADA' || status === 'CONCLUIDA') {
          // Recurring charge paid successfully - generate multiple deliveries for the month
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('frequency, is_emergency, delivery_weekday, delivery_weekdays, delivery_time_slot, total_amount')
            .eq('id', sub.id)
            .single();

          const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
          let monthlyDeliveries = 1;
          if (fullSub && !fullSub.is_emergency) {
            if (fullSub.delivery_weekdays && fullSub.delivery_weekdays.length > 0) {
              monthlyDeliveries = Math.round(fullSub.delivery_weekdays.length * 4.33);
            } else {
              monthlyDeliveries = freqMap[fullSub?.frequency || 'semanal'] || 4;
            }
          }

          // Generate all delivery dates for the month
          const deliveryDates = generateMonthlyDeliveryDates(
            sub.delivery_weekday,
            sub.delivery_weekdays,
            monthlyDeliveries
          );

          const nextDelivery = deliveryDates[0] || calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          await supabase.from('subscriptions').update({
            next_delivery_date: nextDelivery,
            pix_recorrencia_status: 'ativa',
          }).eq('id', sub.id);

          // Create delivery records for all dates
          const deliveryRecords = deliveryDates.map(date => ({
            subscription_id: sub.id,
            delivery_date: date,
            total_amount: sub.total_amount,
            payment_status: 'confirmado' as const,
            delivery_status: 'aguardando' as const,
          }));

          if (deliveryRecords.length > 0) {
            await supabase.from('subscription_deliveries').insert(deliveryRecords);
          }

          logStep("Recurring charge paid, multiple deliveries scheduled", { subscriptionId: sub.id, deliveryCount: deliveryRecords.length, dates: deliveryDates });
          await logAuditEvent('cobr_paga', { subscription_id: sub.id, idRec, txid, deliveryCount: deliveryRecords.length });

        } else if (status === 'CANCELADA' || status === 'NAO_REALIZADA' || status === 'REJEITADA') {
          // Payment failed
          await supabase.from('subscriptions').update({
            status: 'pausada',
            pix_recorrencia_status: 'falha_cobranca',
          }).eq('id', sub.id);

          logStep("Recurring charge failed, subscription paused", { subscriptionId: sub.id, status });
          await logAuditEvent('cobr_falha', { subscription_id: sub.id, idRec, txid, status });
        }
      }
    }

    // ======================================================================
    // Handle standard PIX events (fallback for /v2/cob confirmations)
    // ======================================================================
    if (body.pix) {
      for (const pixEvent of Array.isArray(body.pix) ? body.pix : [body.pix]) {
        const txid = pixEvent.txid;
        const endToEndId = pixEvent.endToEndId;
        logStep("Standard Pix event", { txid, endToEndId });

        if (!txid) continue;

        // Check subscriptions with this txid (immediate payment of Jornada 3)
        const sub = await findSubscription(txid);
        if (sub && sub.status !== 'ativa') {
          // Get frequency info to generate multiple deliveries
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('frequency, is_emergency, delivery_weekdays')
            .eq('id', sub.id)
            .single();

          const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
          let monthlyDeliveries = 1;
          if (fullSub && !fullSub.is_emergency) {
            if (fullSub.delivery_weekdays && fullSub.delivery_weekdays.length > 0) {
              monthlyDeliveries = Math.round(fullSub.delivery_weekdays.length * 4.33);
            } else {
              monthlyDeliveries = freqMap[fullSub?.frequency || 'semanal'] || 4;
            }
          }

          const deliveryDates = generateMonthlyDeliveryDates(sub.delivery_weekday, sub.delivery_weekdays, monthlyDeliveries);
          const nextDelivery = deliveryDates[0] || calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

          await supabase.from('subscriptions').update({
            status: 'ativa',
            next_delivery_date: nextDelivery,
            pix_recorrencia_data_inicio: new Date().toISOString(),
            pix_recorrencia_valor_mensal: sub.total_amount,
          }).eq('id', sub.id);

          // Create delivery records for all dates
          const deliveryRecords = deliveryDates.map(date => ({
            subscription_id: sub.id,
            delivery_date: date,
            total_amount: sub.total_amount,
            payment_status: 'confirmado' as const,
            delivery_status: 'aguardando' as const,
          }));

          if (deliveryRecords.length > 0) {
            await supabase.from('subscription_deliveries').insert(deliveryRecords);
          }

          logStep("Subscription activated via pix event, multiple deliveries created", { subscriptionId: sub.id, deliveryCount: deliveryRecords.length });
          await logAuditEvent('pix_sub_ativada', { subscription_id: sub.id, txid, deliveryCount: deliveryRecords.length });
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
