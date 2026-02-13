import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
  console.log(`[CREATE-PAYMENT] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

// ===== SHARED: Load Pix/Efi mTLS certificates =====
async function loadPixCertificates() {
  const { data: pixSettings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['pix_client_id', 'pix_client_secret', 'pix_key', 'pix_certificates_meta']);

  const pixMap = new Map(pixSettings?.map((s: any) => [s.key, s.value]) || []);
  const clientId = pixMap.get('pix_client_id') as string;
  const clientSecret = pixMap.get('pix_client_secret') as string;
  const pixKey = pixMap.get('pix_key') as string;
  const certsMeta = pixMap.get('pix_certificates_meta') as any;

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais do Banco Inter não configuradas. Acesse Configurações > Integrações Pix para configurar.");
  }

  let certPem = '';
  let keyPem = '';

  // Try .crt + .key (Banco Inter)
  if (certsMeta?.pix_cert_crt?.storage_path) {
    const { data: crtData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_crt.storage_path);
    if (crtData) certPem = await crtData.text();
  }
  if (certsMeta?.pix_cert_key?.storage_path) {
    const { data: keyData } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_key.storage_path);
    if (keyData) keyPem = await keyData.text();
  }

  // Try .p12 (EFI/Gerencianet)
  if (!certPem && certsMeta?.pix_cert_p12?.storage_path) {
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

  // Try .pem
  if (!certPem && certsMeta?.pix_cert_pem?.storage_path) {
    const { data: pemBlob } = await supabase.storage.from('bank-certificates').download(certsMeta.pix_cert_pem.storage_path);
    if (pemBlob) {
      const pemData = await pemBlob.text();
      const certMatch = pemData.match(/(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g);
      const keyMatch = pemData.match(/(-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----)/);
      if (certMatch) certPem = certMatch.join('\n');
      if (keyMatch) keyPem = keyMatch[1];
    }
  }

  // Fallback: environment secrets
  if (!certPem) certPem = Deno.env.get("INTER_API_CERT") || '';
  if (!keyPem) keyPem = Deno.env.get("INTER_API_KEY") || '';

  if (!certPem || !keyPem) {
    throw new Error("Certificados mTLS não configurados. Faça upload do certificado em Configurações > Integrações Pix.");
  }

  return { clientId, clientSecret, pixKey, certPem, keyPem };
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
    throw new Error(`Erro ao autenticar com Efí Pay (HTTP ${tokenResponse.status}): ${errorBody}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Helper for Efí API calls with logging
async function efiRequest(method: string, path: string, accessToken: string, httpClient: any, body?: any) {
  const url = `${EFI_BASE}${path}`;
  logStep(`Efí ${method} ${path}`, body ? { payload: body } : undefined);

  const opts: any = {
    method,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    client: httpClient,
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }

  logStep(`Efí response ${method} ${path}`, { status: res.status, data });

  if (!res.ok) {
    throw new Error(`Efí ${method} ${path} falhou (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

// Log audit event to system_settings
async function logAuditEvent(type: string, details: any) {
  await supabase.from('system_settings').upsert({
    key: `pix_audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    value: { type, ...details, timestamp: new Date().toISOString() } as any,
    description: `Audit: ${type}`,
  }, { onConflict: 'key' });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, order_id, subscription_id, payment_method, return_url } = body;

    if (!payment_method || !['cartao', 'pix'].includes(payment_method)) {
      return new Response(
        JSON.stringify({ error: "payment_method deve ser 'cartao' ou 'pix'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let amount = 0;
    let customerEmail = '';
    let customerName = '';
    let customerCpfCnpj = '';
    let referenceId = '';
    let description = '';
    let frequency = 'mensal';

    if (type === 'order' && order_id) {
      const { data: order, error } = await supabase
        .from('orders')
        .select('*, customer:customers(*)')
        .eq('id', order_id)
        .single();
      if (error || !order) throw new Error('Pedido não encontrado');
      amount = order.total_amount;
      customerEmail = order.customer?.email || '';
      customerName = order.customer?.name || '';
      customerCpfCnpj = order.customer?.cpf_cnpj || '';
      referenceId = order.order_number;
      description = `Pedido ${order.order_number}`;

      await supabase.from('orders').update({ payment_method }).eq('id', order_id);

    } else if (type === 'subscription' && subscription_id) {
      const { data: sub, error } = await supabase
        .from('subscriptions')
        .select('*, customer:customers(*)')
        .eq('id', subscription_id)
        .single();
      if (error || !sub) throw new Error('Assinatura não encontrada');
      amount = sub.total_amount;
      customerEmail = sub.customer?.email || '';
      customerName = sub.customer?.name || '';
      customerCpfCnpj = sub.customer?.cpf_cnpj || '';
      referenceId = sub.subscription_number;
      description = sub.is_emergency
        ? `Pedido Emergencial ${sub.subscription_number}`
        : `Assinatura ${sub.subscription_number}`;
      frequency = sub.frequency || 'mensal';
    } else {
      return new Response(
        JSON.stringify({ error: "Informe type ('order'/'subscription') e o ID correspondente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ error: "Valor inválido para pagamento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== STRIPE (CARTÃO) =====
    if (payment_method === 'cartao') {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) throw new Error("STRIPE_SECRET_KEY não configurada");

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      // ---- SUBSCRIPTION: Create Stripe Subscription (recurring) ----
      if (type === 'subscription' && subscription_id) {
        logStep("Creating Stripe subscription (recurring)", { amount, referenceId });

        let stripeCustomerId: string | null = null;

        const { data: existingSub } = await supabase.from('subscriptions')
          .select('stripe_customer_id')
          .eq('id', subscription_id)
          .single();

        if (existingSub?.stripe_customer_id) {
          stripeCustomerId = existingSub.stripe_customer_id;
        } else if (customerEmail) {
          const existingCustomers = await stripe.customers.list({ email: customerEmail, limit: 1 });
          if (existingCustomers.data.length > 0) {
            stripeCustomerId = existingCustomers.data[0].id;
          }
        }

        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: customerEmail || undefined,
            name: customerName || undefined,
            metadata: { subscription_id, reference_id: referenceId },
          });
          stripeCustomerId = customer.id;
        }

        const product = await stripe.products.create({
          name: description,
          metadata: { subscription_id, reference_id: referenceId },
        });

        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(amount * 100),
          currency: 'brl',
          recurring: { interval: 'month' },
        });

        const session = await stripe.checkout.sessions.create({
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [{ price: price.id, quantity: 1 }],
          mode: 'subscription',
          success_url: return_url ? `${return_url}?payment=success` : `${req.headers.get("origin")}/assinaturas?payment=success`,
          cancel_url: return_url ? `${return_url}?payment=cancelled` : `${req.headers.get("origin")}/assinaturas?payment=cancelled`,
          metadata: { type: 'subscription', subscription_id, reference_id: referenceId },
        });

        await supabase.from('subscriptions').update({
          stripe_customer_id: stripeCustomerId,
          stripe_price_id: price.id,
          stripe_subscription_id: session.id,
          payment_url: session.url,
        }).eq('id', subscription_id);

        return new Response(
          JSON.stringify({
            success: true, payment_method: 'cartao',
            checkout_url: session.url, session_id: session.id,
            payment_url: session.url, mode: 'subscription',
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ---- ORDER: One-time Stripe checkout ----
      logStep("Creating Stripe one-time checkout", { amount, referenceId });

      const sessionParams: any = {
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'brl',
            product_data: { name: description },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: return_url ? `${return_url}?payment=success` : `${req.headers.get("origin")}/pedidos?payment=success`,
        cancel_url: return_url ? `${return_url}?payment=cancelled` : `${req.headers.get("origin")}/pedidos?payment=cancelled`,
        metadata: { type: 'order', order_id: order_id || '', reference_id: referenceId },
      };
      if (customerEmail) sessionParams.customer_email = customerEmail;

      const session = await stripe.checkout.sessions.create(sessionParams);

      await supabase.from('orders').update({
        stripe_payment_intent_id: session.id,
        payment_status: 'pendente',
        payment_url: session.url,
      }).eq('id', order_id);

      return new Response(
        JSON.stringify({
          success: true, payment_method: 'cartao',
          checkout_url: session.url, session_id: session.id,
          payment_url: session.url, mode: 'payment',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== PIX =====
    if (payment_method === 'pix') {
      const { clientId, clientSecret, pixKey, certPem, keyPem } = await loadPixCertificates();
      const httpClient = Deno.createHttpClient({ cert: certPem, key: keyPem });
      const accessToken = await getEfiAccessToken(clientId, clientSecret, httpClient);

      // ======================================================================
      // SUBSCRIPTION: Check if emergency (use simple cob) or regular (Jornada 3)
      // ======================================================================
      if (type === 'subscription' && subscription_id) {
        // Fetch subscription to check is_emergency flag
        const { data: subCheck } = await supabase.from('subscriptions')
          .select('is_emergency')
          .eq('id', subscription_id)
          .single();

        const isEmergencyOrder = subCheck?.is_emergency === true;

        // ---- EMERGENCY: Simple Pix charge (POST /v2/cob) ----
        if (isEmergencyOrder) {
          logStep("Creating Pix charge (cob) for EMERGENCY order", { amount, referenceId });

          const cobPayload = {
            calendario: { expiracao: 3600 },
            valor: { original: amount.toFixed(2) },
            chave: pixKey || "",
            solicitacaoPagador: description,
            infoAdicionais: [{ nome: "Referência", valor: referenceId }, { nome: "Tipo", valor: "emergencial" }],
          };

          const cobData = await efiRequest('POST', '/v2/cob', accessToken, httpClient, cobPayload);
          const pixCopiaECola = cobData.pixCopiaECola || cobData.brcode || '';
          const pixLocation = cobData.location || '';

          await supabase.from('subscriptions').update({
            pix_transaction_id: cobData.txid,
            payment_url: pixLocation,
            pix_copia_e_cola: pixCopiaECola,
          }).eq('id', subscription_id);

          await logAuditEvent('emergency_cob_criado', { subscription_id, txid: cobData.txid });

          return new Response(
            JSON.stringify({
              success: true, payment_method: 'pix',
              txid: cobData.txid, pix_copia_e_cola: pixCopiaECola,
              payment_url: pixLocation, location: pixLocation,
              mode: 'emergency_one_time',
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ---- REGULAR SUBSCRIPTION: Pix Automático – Jornada 3 ----
        logStep("=== JORNADA 3: Pix Automático para assinatura ===", { amount, referenceId });

        // Mapa de periodicidade
        const periodicidadeMap: Record<string, string> = {
          diaria: 'MENSAL',   // mínimo suportado pelo Pix Automático
          semanal: 'MENSAL',
          quinzenal: 'MENSAL',
          mensal: 'MENSAL',
        };
        const periodicidade = periodicidadeMap[frequency] || 'MENSAL';

        // Devedor
        const devedor: any = { nome: customerName || 'Cliente' };
        if (customerCpfCnpj) {
          const cleaned = customerCpfCnpj.replace(/\D/g, '');
          if (cleaned.length === 11) devedor.cpf = cleaned;
          else if (cleaned.length === 14) devedor.cnpj = cleaned;
        }

        // ------------------------------------------------------------------
        // PASSO 1: Criar location para recorrência → POST /v2/locrec
        // ------------------------------------------------------------------
        let locData: any;
        try {
          locData = await efiRequest('POST', '/v2/locrec', accessToken, httpClient);
          logStep("Passo 1 OK: locrec criado", { locId: locData.id, location: locData.location });
          await logAuditEvent('locrec_criado', { subscription_id, locId: locData.id, location: locData.location });
        } catch (err: any) {
          logStep("Passo 1 ERRO: falha ao criar locrec", { error: err.message });
          await logAuditEvent('locrec_erro', { subscription_id, error: err.message });
          throw new Error(`Erro ao criar location de recorrência: ${err.message}`);
        }

        // ------------------------------------------------------------------
        // PASSO 2: Criar cobrança imediata → POST /v2/cob
        // ------------------------------------------------------------------
        let cobData: any;
        try {
          const cobPayload = {
            calendario: { expiracao: 3600 },
            valor: { original: amount.toFixed(2) },
            chave: pixKey || "",
            solicitacaoPagador: description,
            infoAdicionais: [
              { nome: "Referência", valor: referenceId },
              { nome: "Tipo", valor: "assinatura_pix_automatico" },
            ],
          };
          cobData = await efiRequest('POST', '/v2/cob', accessToken, httpClient, cobPayload);
          logStep("Passo 2 OK: cob criado", { txid: cobData.txid });
          await logAuditEvent('cob_criado', { subscription_id, txid: cobData.txid });
        } catch (err: any) {
          logStep("Passo 2 ERRO: falha ao criar cob", { error: err.message });
          await logAuditEvent('cob_erro', { subscription_id, error: err.message });
          throw new Error(`Erro ao criar cobrança imediata: ${err.message}`);
        }

        // ------------------------------------------------------------------
        // PASSO 3: Criar recorrência → POST /v2/rec
        // Vincula location (passo 1) + txid da cob (passo 2)
        // ------------------------------------------------------------------
        let recData: any;
        try {
          const today = new Date();
          // dataInicial = same day next month (e.g. if contracted on 11/02, first recurrence is 11/03)
          const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
          // Handle edge case: if day doesn't exist in next month (e.g. Jan 31 -> Feb 28)
          if (nextMonth.getDate() !== today.getDate()) {
            nextMonth.setDate(0); // last day of previous month
          }
          const dataInicial = nextMonth.toISOString().split('T')[0];
          const dataFinal = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()).toISOString().split('T')[0];

          const recPayload = {
            vinculo: {
              contrato: referenceId,
              devedor,
              objeto: description,
            },
            calendario: {
              dataInicial,
              dataFinal,
              periodicidade,
            },
            valor: {
              valorRec: amount.toFixed(2),
            },
            politicaRetentativa: "PERMITE_3R_7D",
            loc: locData.id,
            ativacao: {
              dadosJornada: {
                txid: cobData.txid,
              },
            },
          };

          recData = await efiRequest('POST', '/v2/rec', accessToken, httpClient, recPayload);
          logStep("Passo 3 OK: rec criado", { idRec: recData.idRec, status: recData.status });
          await logAuditEvent('rec_criado', {
            subscription_id,
            idRec: recData.idRec,
            txid: cobData.txid,
            locId: locData.id,
            status: recData.status,
            tipoJornada: recData.ativacao?.dadosJornada?.tipoJornada,
          });
        } catch (err: any) {
          logStep("Passo 3 ERRO: falha ao criar rec", { error: err.message });
          await logAuditEvent('rec_erro', { subscription_id, error: err.message });

          // Fallback: se o Pix Automático não está disponível, retorna a cob simples
          logStep("Fallback: retornando cobrança imediata simples (sem recorrência)");
          const pixCopiaECola = cobData.pixCopiaECola || cobData.brcode || '';
          const pixLocation = cobData.location || '';

          await supabase.from('subscriptions').update({
            pix_transaction_id: cobData.txid,
            payment_url: pixLocation,
            pix_copia_e_cola: pixCopiaECola,
            pix_recorrencia_valor_mensal: amount,
            pix_recorrencia_status: 'fallback_cob',
          }).eq('id', subscription_id);

          return new Response(
            JSON.stringify({
              success: true, payment_method: 'pix',
              txid: cobData.txid, pix_copia_e_cola: pixCopiaECola,
              payment_url: pixLocation, location: pixLocation,
              mode: 'subscription_fallback_cob',
              warning: 'Pix Automático indisponível, gerada cobrança imediata simples.',
              error_detail: err.message,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // ------------------------------------------------------------------
        // PASSO 4: Consultar recorrência para obter copia e cola combinado
        //          GET /v2/rec/:idRec?txid=<txid>
        // ------------------------------------------------------------------
        let pixCopiaECola = '';
        let recLocation = '';
        try {
          const recConsulta = await efiRequest(
            'GET',
            `/v2/rec/${recData.idRec}?txid=${cobData.txid}`,
            accessToken,
            httpClient
          );
          pixCopiaECola = recConsulta.dadosQR?.pixCopiaECola || '';
          recLocation = recConsulta.loc?.location || locData.location || '';
          logStep("Passo 4 OK: copia e cola obtido", {
            temCopiaECola: !!pixCopiaECola,
            location: recLocation,
            jornada: recConsulta.dadosQR?.jornada,
          });
          await logAuditEvent('rec_consulta_ok', {
            subscription_id,
            idRec: recData.idRec,
            temCopiaECola: !!pixCopiaECola,
            jornada: recConsulta.dadosQR?.jornada,
          });
        } catch (err: any) {
          logStep("Passo 4 AVISO: não foi possível obter copia e cola da rec, usando da cob", { error: err.message });
          pixCopiaECola = cobData.pixCopiaECola || cobData.brcode || '';
          recLocation = locData.location || cobData.location || '';
          await logAuditEvent('rec_consulta_fallback', { subscription_id, error: err.message });
        }

        // Salvar IDs na assinatura
        await supabase.from('subscriptions').update({
          pix_transaction_id: cobData.txid,
          pix_autorizacao_id: recData.idRec,
          payment_url: recLocation,
          pix_copia_e_cola: pixCopiaECola,
          pix_recorrencia_valor_mensal: amount,
          pix_recorrencia_status: 'aguardando_autorizacao',
        }).eq('id', subscription_id);

        logStep("=== JORNADA 3 COMPLETA ===", {
          subscription_id,
          txid: cobData.txid,
          idRec: recData.idRec,
          locId: locData.id,
        });

        return new Response(
          JSON.stringify({
            success: true,
            payment_method: 'pix',
            txid: cobData.txid,
            idRec: recData.idRec,
            pix_copia_e_cola: pixCopiaECola,
            payment_url: recLocation,
            location: recLocation,
            mode: 'pix_automatico_jornada3',
            steps: {
              locrec: { id: locData.id, location: locData.location },
              cob: { txid: cobData.txid },
              rec: { idRec: recData.idRec, status: recData.status },
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ======================================================================
      // ORDER: Pix Avulso – Cobrança imediata única → POST /v2/cob
      // ======================================================================
      logStep("Creating Pix charge (cob) for order", { amount, referenceId });

      const cobPayload = {
        calendario: { expiracao: 3600 },
        valor: { original: amount.toFixed(2) },
        chave: pixKey || "",
        solicitacaoPagador: description,
        infoAdicionais: [{ nome: "Referência", valor: referenceId }],
      };

      const cobData = await efiRequest('POST', '/v2/cob', accessToken, httpClient, cobPayload);

      const pixCopiaECola = cobData.pixCopiaECola || cobData.brcode || '';
      const pixLocation = cobData.location || '';

      await supabase.from('orders').update({
        pix_transaction_id: cobData.txid,
        payment_status: 'pendente',
        payment_method: 'pix',
        payment_url: pixLocation,
        pix_copia_e_cola: pixCopiaECola,
      }).eq('id', order_id);

      await logAuditEvent('order_cob_criado', { order_id, txid: cobData.txid });

      return new Response(
        JSON.stringify({
          success: true, payment_method: 'pix',
          txid: cobData.txid, pix_copia_e_cola: pixCopiaECola,
          payment_url: pixLocation, location: pixLocation,
          mode: 'one_time',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método de pagamento não suportado" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error?.message });
    return new Response(
      JSON.stringify({ error: error?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
