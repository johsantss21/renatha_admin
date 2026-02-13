import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
      logStep("WARNING: No webhook secret configured, parsing event without verification");
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      // ===== CHECKOUT COMPLETED (orders one-time + subscriptions first payment) =====
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        logStep("Checkout completed", { metadata, mode: session.mode, amount: session.amount_total });

        if (metadata.type === 'order' && metadata.order_id) {
          // ORDER: one-time payment confirmed
          const delivery = await calculateDeliveryDate();
          const { error } = await supabase.from('orders').update({
            payment_status: 'confirmado',
            payment_confirmed_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string || session.id,
            delivery_date: delivery.delivery_date,
            delivery_time_slot: delivery.delivery_time_slot,
          }).eq('id', metadata.order_id);

          if (error) logStep("Error updating order", { error: error.message });
          else logStep("Order payment confirmed", { orderId: metadata.order_id, delivery });
        }

        if (metadata.type === 'subscription' && metadata.subscription_id) {
          // SUBSCRIPTION: Stripe subscription created via checkout
          const { data: sub } = await supabase.from('subscriptions')
            .select('delivery_weekday, delivery_weekdays')
            .eq('id', metadata.subscription_id)
            .single();

          const nextDelivery = sub
            ? calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays)
            : null;

          // Save the actual Stripe subscription ID (from the checkout session)
          const stripeSubscriptionId = session.subscription as string || session.id;

          const { error } = await supabase.from('subscriptions').update({
            stripe_subscription_id: stripeSubscriptionId,
            status: 'ativa',
            next_delivery_date: nextDelivery,
          }).eq('id', metadata.subscription_id);

          if (error) logStep("Error updating subscription", { error: error.message });
          else logStep("Subscription activated after Stripe checkout", { subscriptionId: metadata.subscription_id, stripeSubscriptionId, nextDelivery });
        }
        break;
      }

      // ===== INVOICE PAID (recurring subscription payments) =====
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId = invoice.subscription as string;

        if (stripeSubscriptionId) {
          logStep("Invoice paid for subscription", { subscriptionId: stripeSubscriptionId, amount: invoice.amount_paid });

          // Find our subscription by stripe_subscription_id
          const { data: subs } = await supabase.from('subscriptions')
            .select('id, delivery_weekday, delivery_weekdays, status')
            .eq('stripe_subscription_id', stripeSubscriptionId)
            .limit(1);

          if (subs && subs.length > 0) {
            const sub = subs[0];
            const nextDelivery = calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

            // Ensure subscription is active and schedule next delivery
            await supabase.from('subscriptions').update({
              status: 'ativa',
              next_delivery_date: nextDelivery,
            }).eq('id', sub.id);

            logStep("Subscription renewed via invoice.paid", { subscriptionId: sub.id, nextDelivery });
          } else {
            logStep("No subscription found for stripe_subscription_id", { stripeSubscriptionId });
          }
        }
        break;
      }

      // ===== INVOICE PAYMENT FAILED =====
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId = invoice.subscription as string;

        if (stripeSubscriptionId) {
          logStep("Invoice payment failed", { subscriptionId: stripeSubscriptionId });

          const { data: subs } = await supabase.from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', stripeSubscriptionId)
            .limit(1);

          if (subs && subs.length > 0) {
            // Pause the subscription on payment failure
            await supabase.from('subscriptions').update({
              status: 'pausada',
            }).eq('id', subs[0].id);

            logStep("Subscription paused due to payment failure", { subscriptionId: subs[0].id });
          }
        } else {
          // Fallback: check if it's a one-time payment intent failure
          const paymentIntent = invoice.payment_intent as string;
          if (paymentIntent) {
            const { data: orders } = await supabase.from('orders')
              .select('id')
              .eq('stripe_payment_intent_id', paymentIntent)
              .limit(1);

            if (orders && orders.length > 0) {
              await supabase.from('orders').update({
                payment_status: 'recusado',
              }).eq('id', orders[0].id);
              logStep("Order payment failed", { orderId: orders[0].id });
            }
          }
        }
        break;
      }

      // ===== PAYMENT INTENT FAILED (one-time orders) =====
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        logStep("Payment intent failed", { id: paymentIntent.id });

        const { data: orders } = await supabase.from('orders')
          .select('id')
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .limit(1);

        if (orders && orders.length > 0) {
          await supabase.from('orders').update({
            payment_status: 'recusado',
          }).eq('id', orders[0].id);
          logStep("Order payment failed", { orderId: orders[0].id });
        }
        break;
      }

      // ===== SUBSCRIPTION DELETED (cancelled from Stripe) =====
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Stripe subscription deleted", { id: subscription.id });

        const { data: subs } = await supabase.from('subscriptions')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .limit(1);

        if (subs && subs.length > 0) {
          await supabase.from('subscriptions').update({
            status: 'cancelada',
          }).eq('id', subs[0].id);

          logStep("Subscription cancelled via Stripe", { subscriptionId: subs[0].id });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
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