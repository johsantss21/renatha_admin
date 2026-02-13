import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const EFI_BASE = "https://pix.api.efipay.com.br";

const logStep = (step: string, details?: any) => {
  console.log(`[CHECK-PIX] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

async function getEfiCredentials() {
  const { data: pixSettings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['pix_client_id', 'pix_client_secret', 'pix_certificates_meta']);

  const pixMap = new Map(pixSettings?.map((s: any) => [s.key, s.value]) || []);
  const clientId = pixMap.get('pix_client_id') as string;
  const clientSecret = pixMap.get('pix_client_secret') as string;
  const certsMeta = pixMap.get('pix_certificates_meta') as any;

  if (!clientId || !clientSecret) throw new Error("Credenciais Efí não configuradas");

  let certPem = '';
  let keyPem = '';

  if (certsMeta?.pix_cert_p12?.storage_path) {
    const { data: p12Blob } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_p12.storage_path);
    if (p12Blob) {
      const p12Bytes = new Uint8Array(await p12Blob.arrayBuffer());
      let binaryStr = '';
      for (let i = 0; i < p12Bytes.length; i++) {
        binaryStr += String.fromCharCode(p12Bytes[i]);
      }
      const p12Der = forge.util.createBuffer(binaryStr, 'raw');
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12Parsed = forge.pkcs12.pkcs12FromAsn1(p12Asn1, '');

      const certBags = p12Parsed.getBags({ bagType: forge.pki.oids.certBag });
      const allCerts = certBags[forge.pki.oids.certBag] || [];
      if (allCerts.length > 0 && allCerts[0].cert) {
        certPem = allCerts.map((b: any) => b.cert ? forge.pki.certificateToPem(b.cert) : '').filter(Boolean).join('\n');
      }

      const keyBags = p12Parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      let keyBag = (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0];
      if (!keyBag?.key) {
        const keyBags2 = p12Parsed.getBags({ bagType: forge.pki.oids.keyBag });
        keyBag = (keyBags2[forge.pki.oids.keyBag] || [])[0];
      }
      if (keyBag?.key) {
        const rsaPrivateKey = forge.pki.privateKeyToAsn1(keyBag.key);
        const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKey);
        keyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo);
      }
    }
  }

  if (!certPem && certsMeta?.pix_cert_crt?.storage_path) {
    const { data: crtData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_crt.storage_path);
    if (crtData) certPem = await crtData.text();
  }
  if (!keyPem && certsMeta?.pix_cert_key?.storage_path) {
    const { data: keyData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_key.storage_path);
    if (keyData) keyPem = await keyData.text();
  }

  if (!certPem || !keyPem) throw new Error("Certificados mTLS não encontrados");

  return { clientId, clientSecret, certPem, keyPem };
}

async function getEfiAccessToken(clientId: string, clientSecret: string, httpClient: any) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const tokenResponse = await fetch(`${EFI_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    client: httpClient,
  } as any);

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text().catch(() => '');
    throw new Error(`Efí OAuth error (${tokenResponse.status}): ${errorBody}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Calculate delivery date for ORDERS (hora_limite logic)
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

function generateMonthlyDeliveryDates2(deliveryWeekday: string, deliveryWeekdays: string[] | null, count: number): string[] {
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

  for (let i = 0; i < 35 && dates.length < count; i++) {
    if (targetDays.includes(candidate.getDay())) {
      dates.push(candidate.toISOString().split('T')[0]);
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  return dates;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, order_id, subscription_id } = body;

    logStep("Check payment request", { type, order_id, subscription_id });

    // ===== ORDER CHECK =====
    if (type === 'order' && order_id) {
      const { data: order } = await supabase.from('orders')
        .select('id, pix_transaction_id, payment_status, payment_method')
        .eq('id', order_id)
        .single();
      if (!order) throw new Error("Pedido não encontrado");
      if (order.payment_status === 'confirmado') {
        return new Response(JSON.stringify({ status: 'confirmado', already_confirmed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (order.payment_method === 'cartao') {
        return await checkStripePayment(order_id, type);
      }

      if (!order.pix_transaction_id) {
        return new Response(JSON.stringify({ status: 'no_txid', message: 'Nenhuma transação Pix encontrada' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check cob status
      const { clientId, clientSecret, certPem, keyPem } = await getEfiCredentials();
      const httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });
      const accessToken = await getEfiAccessToken(clientId, clientSecret, httpClient);

      const cobResponse = await fetch(`${EFI_BASE}/v2/cob/${order.pix_transaction_id}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${accessToken}` },
        client: httpClient,
      } as any);

      if (!cobResponse.ok) {
        const errorText = await cobResponse.text();
        logStep("Efí cob query error", { status: cobResponse.status, body: errorText });
        throw new Error(`Erro ao consultar Efí: ${cobResponse.status}`);
      }

      const cobData = await cobResponse.json();
      logStep("Efí cob response", { status: cobData.status, txid: cobData.txid });

      if (cobData.status === 'CONCLUIDA') {
        const delivery = await calculateDeliveryDate();
        await supabase.from('orders').update({
          payment_status: 'confirmado',
          payment_confirmed_at: new Date().toISOString(),
          delivery_date: delivery.delivery_date,
          delivery_time_slot: delivery.delivery_time_slot,
        }).eq('id', order_id);

        // Consume stock for order items
        const { data: orderItems } = await supabase.from('order_items')
          .select('product_id, quantity')
          .eq('order_id', order_id);
        if (orderItems) {
          for (const item of orderItems) {
            const { data: product } = await supabase.from('products')
              .select('stock')
              .eq('id', item.product_id)
              .single();
            if (product) {
              await supabase.from('products')
                .update({ stock: Math.max(0, product.stock - item.quantity) })
                .eq('id', item.product_id);
            }
          }
          logStep("Stock consumed for order", { orderId: order_id, items: orderItems.length });
        }

        logStep("Order confirmed via polling", { orderId: order_id, delivery });

        return new Response(JSON.stringify({ status: 'confirmado', updated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check expiration
      if (cobData.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' || cobData.status === 'REMOVIDA_PELO_PSP') {
        await supabase.from('orders').update({ payment_status: 'cancelado' }).eq('id', order_id);
        return new Response(JSON.stringify({ status: 'expirado', efi_status: cobData.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ status: 'pendente', efi_status: cobData.status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SUBSCRIPTION CHECK =====
    if (type === 'subscription' && subscription_id) {
      const { data: sub } = await supabase.from('subscriptions')
        .select('id, pix_transaction_id, pix_autorizacao_id, status, pix_copia_e_cola, delivery_weekday, delivery_weekdays, total_amount, pix_recorrencia_status, stripe_subscription_id')
        .eq('id', subscription_id)
        .single();
      if (!sub) throw new Error("Assinatura não encontrada");
      if (sub.status === 'ativa') {
        return new Response(JSON.stringify({ status: 'ativa', already_confirmed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check Stripe if applicable
      if (sub.stripe_subscription_id && !sub.pix_transaction_id) {
        return await checkStripeSubscription(subscription_id, sub.stripe_subscription_id);
      }

      if (!sub.pix_transaction_id) {
        return new Response(JSON.stringify({ status: 'no_txid', message: 'Nenhuma transação Pix encontrada' }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { clientId, clientSecret, certPem, keyPem } = await getEfiCredentials();
      const httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });
      const accessToken = await getEfiAccessToken(clientId, clientSecret, httpClient);

      // 1. Check the immediate payment (cob) status
      let cobStatus = 'ATIVA';
      try {
        const cobResponse = await fetch(`${EFI_BASE}/v2/cob/${sub.pix_transaction_id}`, {
          method: "GET",
          headers: { "Authorization": `Bearer ${accessToken}` },
          client: httpClient,
        } as any);
        if (cobResponse.ok) {
          const cobData = await cobResponse.json();
          cobStatus = cobData.status;
          logStep("Cob status for subscription", { txid: sub.pix_transaction_id, status: cobStatus });
        }
      } catch (err: any) {
        logStep("Cob query failed (continuing)", { error: err.message });
      }

      // 2. Check recurrence (rec) status if we have idRec
      let recStatus = '';
      let recApproved = false;
      if (sub.pix_autorizacao_id) {
        try {
          const recResponse = await fetch(`${EFI_BASE}/v2/rec/${sub.pix_autorizacao_id}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${accessToken}` },
            client: httpClient,
          } as any);
          if (recResponse.ok) {
            const recData = await recResponse.json();
            recStatus = recData.status;
            recApproved = recStatus === 'APROVADA';
            logStep("Rec status for subscription", { idRec: sub.pix_autorizacao_id, status: recStatus });
          }
        } catch (err: any) {
          logStep("Rec query failed (continuing)", { error: err.message });
        }
      }

      // Activate subscription if immediate payment is confirmed
      if (cobStatus === 'CONCLUIDA') {
        const nextDelivery = calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays);

        await supabase.from('subscriptions').update({
          status: 'ativa',
          next_delivery_date: nextDelivery,
          pix_recorrencia_autorizada: recApproved,
          pix_recorrencia_status: recApproved ? 'ativa' : 'aguardando_autorizacao',
          pix_recorrencia_data_inicio: new Date().toISOString(),
          pix_recorrencia_valor_mensal: sub.total_amount,
        }).eq('id', subscription_id);

        // Reserve/consume stock for subscription items
        const { data: subItems } = await supabase.from('subscription_items')
          .select('product_id, quantity')
          .eq('subscription_id', subscription_id);
        if (subItems) {
          // Get subscription frequency to calculate monthly deliveries
          const { data: fullSub } = await supabase.from('subscriptions')
            .select('frequency, is_emergency, delivery_weekdays')
            .eq('id', subscription_id)
            .single();

          let monthlyDeliveries = 1;
          if (fullSub && !fullSub.is_emergency) {
            const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
            if (fullSub.delivery_weekdays && fullSub.delivery_weekdays.length > 0) {
              monthlyDeliveries = Math.round(fullSub.delivery_weekdays.length * 4.33);
            } else {
              monthlyDeliveries = freqMap[fullSub.frequency || 'semanal'] || 4;
            }
          }

          for (const item of subItems) {
            const totalReserve = item.quantity * monthlyDeliveries;
            const { data: product } = await supabase.from('products')
              .select('stock')
              .eq('id', item.product_id)
              .single();
            if (product) {
              await supabase.from('products')
                .update({ stock: Math.max(0, product.stock - totalReserve) })
                .eq('id', item.product_id);
            }
            // Update reserved_stock on subscription_items
            await supabase.from('subscription_items')
              .update({ reserved_stock: totalReserve })
              .eq('subscription_id', subscription_id)
              .eq('product_id', item.product_id);
          }
          logStep("Stock reserved for subscription", { subscriptionId: subscription_id, monthlyDeliveries, items: subItems.length });
        }

        // Create delivery records for all dates of the month
        const { data: fullSub2 } = await supabase.from('subscriptions')
          .select('frequency, is_emergency, delivery_weekday, delivery_weekdays')
          .eq('id', subscription_id)
          .single();

        const freqMap2: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
        let monthlyDel = 1;
        if (fullSub2 && !fullSub2.is_emergency) {
          if (fullSub2.delivery_weekdays && fullSub2.delivery_weekdays.length > 0) {
            monthlyDel = Math.round(fullSub2.delivery_weekdays.length * 4.33);
          } else {
            monthlyDel = freqMap2[fullSub2?.frequency || 'semanal'] || 4;
          }
        }

        // Generate all delivery dates
        const allDeliveryDates = generateMonthlyDeliveryDates2(
          sub.delivery_weekday, sub.delivery_weekdays, monthlyDel
        );

        const deliveryRecords = allDeliveryDates.map(date => ({
          subscription_id,
          delivery_date: date,
          total_amount: sub.total_amount,
          payment_status: 'confirmado' as const,
          delivery_status: 'aguardando' as const,
        }));

        if (deliveryRecords.length > 0) {
          await supabase.from('subscription_deliveries').insert(deliveryRecords);
        }

        logStep("Subscription activated via polling", {
          subscriptionId: subscription_id,
          nextDelivery,
          recApproved,
          recStatus,
        });

        return new Response(JSON.stringify({
          status: 'confirmado',
          updated: true,
          rec_status: recStatus,
          rec_approved: recApproved,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if cob expired
      if (cobStatus === 'REMOVIDA_PELO_USUARIO_RECEBEDOR' || cobStatus === 'REMOVIDA_PELO_PSP') {
        return new Response(JSON.stringify({
          status: 'expirado',
          efi_status: cobStatus,
          rec_status: recStatus,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        status: 'pendente',
        efi_status: cobStatus,
        rec_status: recStatus,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Informe type e o ID correspondente");

  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Check Stripe payment status for orders
async function checkStripePayment(orderId: string, _type: string) {
  const { default: Stripe } = await import("https://esm.sh/stripe@18.5.0");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY não configurada");

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const { data: order } = await supabase.from('orders')
    .select('stripe_payment_intent_id')
    .eq('id', orderId)
    .single();

  if (!order?.stripe_payment_intent_id) {
    return new Response(JSON.stringify({ status: 'pendente', message: 'Sem session Stripe' }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_payment_intent_id);
    logStep("Stripe session status", { status: session.payment_status });

    if (session.payment_status === 'paid') {
      const delivery = await calculateDeliveryDate();
      await supabase.from('orders').update({
        payment_status: 'confirmado',
        payment_confirmed_at: new Date().toISOString(),
        delivery_date: delivery.delivery_date,
        delivery_time_slot: delivery.delivery_time_slot,
      }).eq('id', orderId);

      // Consume stock for Stripe order
      const { data: orderItems } = await supabase.from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);
      if (orderItems) {
        for (const item of orderItems) {
          const { data: product } = await supabase.from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single();
          if (product) {
            await supabase.from('products')
              .update({ stock: Math.max(0, product.stock - item.quantity) })
              .eq('id', item.product_id);
          }
        }
      }

      return new Response(JSON.stringify({ status: 'confirmado', updated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: 'pendente', stripe_status: session.payment_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logStep("Stripe check error", { message: err?.message });
    return new Response(JSON.stringify({ status: 'pendente', error: err?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// Check Stripe subscription status
async function checkStripeSubscription(subscriptionId: string, stripeSessionId: string) {
  const { default: Stripe } = await import("https://esm.sh/stripe@18.5.0");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY não configurada");

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  try {
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
    logStep("Stripe subscription session status", { status: session.payment_status });

    if (session.payment_status === 'paid') {
      const { data: sub } = await supabase.from('subscriptions')
        .select('delivery_weekday, delivery_weekdays, total_amount, frequency, is_emergency')
        .eq('id', subscriptionId)
        .single();

      const nextDelivery = sub
        ? calculateNextSubscriptionDelivery(sub.delivery_weekday, sub.delivery_weekdays)
        : null;

      await supabase.from('subscriptions').update({
        status: 'ativa',
        next_delivery_date: nextDelivery,
      }).eq('id', subscriptionId);

      // Reserve stock for Stripe subscription
      const { data: subItems } = await supabase.from('subscription_items')
        .select('product_id, quantity')
        .eq('subscription_id', subscriptionId);
      if (subItems && sub) {
        let monthlyDeliveries = 1;
        if (!sub.is_emergency) {
          const freqMap: Record<string, number> = { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 };
          if (sub.delivery_weekdays && sub.delivery_weekdays.length > 0) {
            monthlyDeliveries = Math.round(sub.delivery_weekdays.length * 4.33);
          } else {
            monthlyDeliveries = freqMap[sub.frequency || 'semanal'] || 4;
          }
        }
        for (const item of subItems) {
          const totalReserve = item.quantity * monthlyDeliveries;
          const { data: product } = await supabase.from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single();
          if (product) {
            await supabase.from('products')
              .update({ stock: Math.max(0, product.stock - totalReserve) })
              .eq('id', item.product_id);
          }
        }
      }

      // Create first delivery record
      if (sub && nextDelivery) {
        await supabase.from('subscription_deliveries').insert({
          subscription_id: subscriptionId,
          delivery_date: nextDelivery,
          total_amount: sub.total_amount,
          payment_status: 'confirmado',
          delivery_status: 'aguardando',
        });
      }

      return new Response(JSON.stringify({ status: 'confirmado', updated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: 'pendente', stripe_status: session.payment_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    logStep("Stripe sub check error", { message: err?.message });
    return new Response(JSON.stringify({ status: 'pendente', error: err?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
