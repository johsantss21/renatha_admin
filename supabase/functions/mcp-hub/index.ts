import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mcp-env",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================
// TOOLS DEFINITION
// ============================================
const TOOLS_REGISTRY = [
  // Customers
  { name: "lovable.customers.getByPhone", description: "Buscar cliente por telefone", args: { phone: "string (obrigatório)" }, method: "GET", path: "/api/customers?phone={phone}" },
  { name: "lovable.customers.getByCpfCnpj", description: "Buscar cliente por CPF/CNPJ", args: { cpf_cnpj: "string (obrigatório)" }, method: "GET", path: "/api/customers?cpf_cnpj={cpf_cnpj}" },
  { name: "lovable.customers.create", description: "Criar novo cliente", args: { payload: "object (name, cpf_cnpj, phone obrigatórios)" }, method: "POST", path: "/api/customers" },
  { name: "lovable.customers.update", description: "Atualizar cliente", args: { id: "string?", cpf_cnpj: "string?", payload: "object" }, method: "PUT", path: "/api/customers" },
  // Products
  { name: "lovable.products.list", description: "Listar produtos", args: { include_inactive: "boolean?" }, method: "GET", path: "/api/products" },
  { name: "lovable.products.getByCode", description: "Buscar produto por código", args: { code: "string (obrigatório)" }, method: "GET", path: "/api/products?code={code}" },
  { name: "lovable.products.create", description: "Criar produto", args: { payload: "object (name obrigatório)" }, method: "POST", path: "/api/products" },
  { name: "lovable.products.update", description: "Atualizar produto", args: { id: "string?", code: "string?", payload: "object" }, method: "PUT", path: "/api/products" },
  { name: "lovable.products.lowStock", description: "Produtos com estoque baixo", args: {}, method: "GET", path: "/api/products-low-stock" },
  // Orders
  { name: "lovable.orders.create", description: "Criar pedido", args: { payload: "object" }, method: "POST", path: "/api/orders" },
  { name: "lovable.orders.get", description: "Consultar pedidos", args: { id: "string?", order_number: "string?", customer_id: "string?" }, method: "GET", path: "/api/orders" },
  { name: "lovable.orders.cancel", description: "Cancelar pedido", args: { id: "string?", order_number: "string?", reason: "string (obrigatório)" }, method: "DELETE", path: "/api/orders" },
  { name: "lovable.deliveries.getByDate", description: "Entregas por data", args: { date: "string YYYY-MM-DD (obrigatório)" }, method: "GET", path: "/api/deliveries?date={date}" },
  // Subscriptions
  { name: "lovable.subscriptions.create", description: "Criar assinatura", args: { payload: "object" }, method: "POST", path: "/api/subscriptions" },
  { name: "lovable.subscriptions.get", description: "Consultar assinaturas", args: { id: "string?", subscription_number: "string?", customer_id: "string?" }, method: "GET", path: "/api/subscriptions" },
  { name: "lovable.subscriptions.update", description: "Atualizar assinatura", args: { id: "string?", subscription_number: "string?", payload: "object" }, method: "PUT", path: "/api/subscriptions" },
  { name: "lovable.subscriptions.cancel", description: "Cancelar assinatura", args: { id: "string?", subscription_number: "string?", reason: "string (obrigatório)" }, method: "PUT", path: "/api/subscriptions" },
  // Settings
  { name: "lovable.settings.get", description: "Consultar configurações", args: { key: "string?" }, method: "GET", path: "/api/settings" },
  { name: "lovable.settings.set", description: "Definir configuração", args: { key: "string (obrigatório)", value: "any", description: "string?" }, method: "PUT", path: "/api/settings" },
  // n8n tools
  { name: "n8n.workflow.trigger", description: "Acionar workflow n8n", args: { workflow_key: "string (obrigatório)", payload: "object" }, method: "WEBHOOK", path: "" },
  { name: "n8n.customer.message.send", description: "Enviar mensagem ao cliente via n8n", args: { phone: "string", text: "string" }, method: "WEBHOOK", path: "" },
  { name: "n8n.admin.message.send", description: "Enviar mensagem ao admin via n8n", args: { text: "string" }, method: "WEBHOOK", path: "" },
  { name: "n8n.deliveries.report.send", description: "Enviar relatório de entregas via n8n", args: { date: "string" }, method: "WEBHOOK", path: "" },
  { name: "n8n.stock.alert.send", description: "Enviar alerta de estoque via n8n", args: {}, method: "WEBHOOK", path: "" },
];

// ============================================
// HELPERS
// ============================================
async function getMcpSettings(): Promise<Map<string, any>> {
  const { data } = await supabase.from("system_settings").select("key, value")
    .in("key", [
      "mcp_enabled", "mcp_shared_secret_prod", "mcp_shared_secret_hml",
      "mcp_allowlist_tools", "mcp_rate_limit_per_minute", "mcp_env_mode",
      "n8n_mcp_webhook_url_prod", "n8n_mcp_webhook_url_hml",
      "n8n_mcp_webhook_secret_prod", "n8n_mcp_webhook_secret_hml",
      "n8n_api_key_prod", "n8n_api_key_hml",
    ]);
  const map = new Map<string, any>();
  for (const row of data || []) {
    let v = row.value;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
    map.set(row.key, v);
  }
  return map;
}

function getEnv(req: Request, settings: Map<string, any>): string {
  return req.headers.get("x-mcp-env") || settings.get("mcp_env_mode") || "prod";
}

function validateBearer(req: Request, settings: Map<string, any>, env: string): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const secret = env === "hml" ? settings.get("mcp_shared_secret_hml") : settings.get("mcp_shared_secret_prod");
  return !!secret && secret !== "" && token === secret;
}

// Simple in-memory rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

async function auditLog(env: string, actor: string, tool: string, traceId: string | null, request: any, response: any, ok: boolean, errorMessage: string | null, ip: string | null) {
  try {
    await supabase.from("mcp_audit_logs").insert({
      env, actor, tool, trace_id: traceId, request, response, ok, error_message: errorMessage, ip,
    });
  } catch (e) { console.error("Audit log error:", e); }
}

async function hmacSign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ============================================
// TOOL EXECUTOR — Lovable tools
// ============================================
async function executeLovableTool(toolName: string, args: any, settings: Map<string, any>): Promise<any> {
  // Get internal API key from system_settings or env
  const { data: apiKeyRow } = await supabase.from("system_settings").select("value").eq("key", "n8n_token").maybeSingle();
  let apiKey = Deno.env.get("N8N_API_KEY") || "";
  if (apiKeyRow?.value) {
    let v = apiKeyRow.value;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
    if (v) apiKey = String(v);
  }

  const baseUrl = `${SUPABASE_URL}/functions/v1/api`;
  let method = "GET";
  let url = baseUrl;
  let body: string | undefined;

  switch (toolName) {
    // Customers
    case "lovable.customers.getByPhone":
      url = `${baseUrl}/customers?phone=${encodeURIComponent(args.phone || "")}`;
      break;
    case "lovable.customers.getByCpfCnpj":
      url = `${baseUrl}/customers?cpf_cnpj=${encodeURIComponent(args.cpf_cnpj || "")}`;
      break;
    case "lovable.customers.create":
      method = "POST"; url = `${baseUrl}/customers`; body = JSON.stringify(args.payload || args);
      break;
    case "lovable.customers.update": {
      method = "PUT";
      const params = new URLSearchParams();
      if (args.id) params.set("id", args.id);
      else if (args.cpf_cnpj) params.set("cpf_cnpj", args.cpf_cnpj);
      url = `${baseUrl}/customers?${params}`; body = JSON.stringify(args.payload || {});
      break;
    }
    // Products
    case "lovable.products.list": {
      const p = args.include_inactive ? "?include_inactive=true" : "";
      url = `${baseUrl}/products${p}`;
      break;
    }
    case "lovable.products.getByCode":
      url = `${baseUrl}/products?code=${encodeURIComponent(args.code || "")}`;
      break;
    case "lovable.products.create":
      method = "POST"; url = `${baseUrl}/products`; body = JSON.stringify(args.payload || args);
      break;
    case "lovable.products.update": {
      method = "PUT";
      const p2 = new URLSearchParams();
      if (args.id) p2.set("id", args.id);
      else if (args.code) p2.set("code", args.code);
      url = `${baseUrl}/products?${p2}`; body = JSON.stringify(args.payload || {});
      break;
    }
    case "lovable.products.lowStock":
      url = `${baseUrl}/products-low-stock`;
      break;
    // Orders
    case "lovable.orders.create":
      method = "POST"; url = `${baseUrl}/orders`; body = JSON.stringify(args.payload || args);
      break;
    case "lovable.orders.get": {
      const p3 = new URLSearchParams();
      if (args.id) p3.set("id", args.id);
      if (args.order_number) p3.set("order_number", args.order_number);
      if (args.customer_id) p3.set("customer_id", args.customer_id);
      url = `${baseUrl}/orders?${p3}`;
      break;
    }
    case "lovable.orders.cancel": {
      method = "DELETE";
      const p4 = new URLSearchParams();
      if (args.id) p4.set("id", args.id);
      else if (args.order_number) p4.set("order_number", args.order_number);
      url = `${baseUrl}/orders?${p4}`; body = JSON.stringify({ reason: args.reason || "Cancelado via MCP" });
      break;
    }
    // Deliveries
    case "lovable.deliveries.getByDate":
      url = `${baseUrl}/deliveries?date=${encodeURIComponent(args.date || "")}`;
      break;
    // Subscriptions
    case "lovable.subscriptions.create":
      method = "POST"; url = `${baseUrl}/subscriptions`; body = JSON.stringify(args.payload || args);
      break;
    case "lovable.subscriptions.get": {
      const p5 = new URLSearchParams();
      if (args.id) p5.set("id", args.id);
      if (args.subscription_number) p5.set("subscription_number", args.subscription_number);
      if (args.customer_id) p5.set("customer_id", args.customer_id);
      url = `${baseUrl}/subscriptions?${p5}`;
      break;
    }
    case "lovable.subscriptions.update": {
      method = "PUT";
      const p6 = new URLSearchParams();
      if (args.id) p6.set("id", args.id);
      else if (args.subscription_number) p6.set("subscription_number", args.subscription_number);
      url = `${baseUrl}/subscriptions?${p6}`; body = JSON.stringify(args.payload || {});
      break;
    }
    case "lovable.subscriptions.cancel": {
      method = "PUT";
      const p7 = new URLSearchParams();
      if (args.id) p7.set("id", args.id);
      else if (args.subscription_number) p7.set("subscription_number", args.subscription_number);
      url = `${baseUrl}/subscriptions?${p7}`;
      body = JSON.stringify({ status: "cancelada", notes: args.reason || "Cancelada via MCP" });
      break;
    }
    // Settings
    case "lovable.settings.get": {
      const kq = args.key ? `?key=${encodeURIComponent(args.key)}` : "";
      url = `${baseUrl}/settings${kq}`;
      break;
    }
    case "lovable.settings.set":
      method = "PUT"; url = `${baseUrl}/settings?key=${encodeURIComponent(args.key || "")}`;
      body = JSON.stringify({ value: args.value, description: args.description });
      break;
    default:
      throw new Error(`Tool desconhecida: ${toolName}`);
  }

  const headers: Record<string, string> = { "x-api-key": apiKey, "Content-Type": "application/json" };
  const resp = await fetch(url, { method, headers, body });
  const result = await resp.json();
  if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);
  return result;
}

// ============================================
// TOOL EXECUTOR — n8n tools
// ============================================
async function executeN8nTool(toolName: string, args: any, settings: Map<string, any>, env: string, traceId: string): Promise<any> {
  const webhookUrl = env === "hml" ? settings.get("n8n_mcp_webhook_url_hml") : settings.get("n8n_mcp_webhook_url_prod");
  const webhookSecret = env === "hml" ? settings.get("n8n_mcp_webhook_secret_hml") : settings.get("n8n_mcp_webhook_secret_prod");

  if (!webhookUrl) throw new Error(`Webhook URL do n8n não configurada para ambiente ${env}`);

  // Map tool to workflow_key
  const workflowKeyMap: Record<string, string> = {
    "n8n.workflow.trigger": args.workflow_key || "generic_trigger",
    "n8n.customer.message.send": "send_customer_message",
    "n8n.admin.message.send": "send_admin_message",
    "n8n.deliveries.report.send": "send_deliveries_report",
    "n8n.stock.alert.send": "send_stock_alert",
  };

  const workflowKey = workflowKeyMap[toolName] || toolName;
  const payload = {
    workflow_key: workflowKey,
    args: args,
    trace_id: traceId,
    source: "lovable_mcp",
    env,
  };

  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MCP-Trace-Id": traceId,
  };

  if (webhookSecret) {
    headers["X-MCP-Signature"] = await hmacSign(bodyStr, webhookSecret);
  }

  const resp = await fetch(webhookUrl, { method: "POST", headers, body: bodyStr });
  const text = await resp.text();
  let result: any;
  try { result = JSON.parse(text); } catch { result = { raw: text }; }

  if (!resp.ok) throw new Error(result.error || `n8n HTTP ${resp.status}: ${text.substring(0, 200)}`);
  return result;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Paths: /mcp-hub/health, /mcp-hub/tools, /mcp-hub/call, /mcp-hub/events
  const route = pathParts[1] || pathParts[0] || "";
  const ip = getClientIp(req);

  try {
    const settings = await getMcpSettings();
    const mcpEnabled = settings.get("mcp_enabled");
    const env = getEnv(req, settings);

    // ---- HEALTH ----
    if (route === "health") {
      return jsonResponse({ ok: !!mcpEnabled, env, timestamp: new Date().toISOString(), version: "1.0.0" });
    }

    // If MCP disabled, block everything else
    if (!mcpEnabled) {
      return jsonResponse({ ok: false, error: "MCP desativado" }, 403);
    }

    // ---- AUTH required for tools, call, events ----
    if (!validateBearer(req, settings, env)) {
      return jsonResponse({ ok: false, error: "Unauthorized - Bearer inválido" }, 401);
    }

    // Rate limit
    const rateLimit = Number(settings.get("mcp_rate_limit_per_minute")) || 60;
    if (!checkRateLimit(ip, rateLimit)) {
      return jsonResponse({ ok: false, error: "Rate limit excedido" }, 429);
    }

    // ---- TOOLS LIST ----
    if (route === "tools") {
      const allowlist: string[] = settings.get("mcp_allowlist_tools") || [];
      const filtered = TOOLS_REGISTRY.filter(t => allowlist.includes(t.name));
      await auditLog(env, "system", "mcp.tools.list", null, {}, { count: filtered.length }, true, null, ip);
      return jsonResponse({ ok: true, env, tools: filtered });
    }

    // ---- CALL ----
    if (route === "call") {
      if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

      const body = await req.json();
      const { tool, args = {}, trace_id } = body;
      const traceId = trace_id || crypto.randomUUID();

      if (!tool) return jsonResponse({ ok: false, error: "Campo 'tool' é obrigatório" }, 400);

      // Check allowlist
      const allowlist: string[] = settings.get("mcp_allowlist_tools") || [];
      if (!allowlist.includes(tool)) {
        await auditLog(env, "n8n", tool, traceId, body, null, false, "Tool não permitida na allowlist", ip);
        return jsonResponse({ ok: false, error: `Tool '${tool}' não está na allowlist` }, 403);
      }

      try {
        let result: any;
        if (tool.startsWith("n8n.")) {
          result = await executeN8nTool(tool, args, settings, env, traceId);
        } else if (tool.startsWith("lovable.")) {
          result = await executeLovableTool(tool, args, settings);
        } else {
          throw new Error(`Prefixo de tool desconhecido: ${tool}`);
        }

        await auditLog(env, tool.startsWith("n8n.") ? "lovable" : "n8n", tool, traceId, body, result, true, null, ip);
        return jsonResponse({ ok: true, trace_id: traceId, result });
      } catch (err: any) {
        await auditLog(env, "n8n", tool, traceId, body, null, false, err.message, ip);
        return jsonResponse({ ok: false, trace_id: traceId, error: err.message }, 500);
      }
    }

    // ---- EVENTS PUBLISH ----
    if (route === "events") {
      if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

      const body = await req.json();
      const { type, payload = {}, trace_id } = body;
      const traceId = trace_id || crypto.randomUUID();

      if (!type) return jsonResponse({ ok: false, error: "Campo 'type' é obrigatório" }, 400);

      try {
        const webhookUrl = env === "hml" ? settings.get("n8n_mcp_webhook_url_hml") : settings.get("n8n_mcp_webhook_url_prod");
        const webhookSecret = env === "hml" ? settings.get("n8n_mcp_webhook_secret_hml") : settings.get("n8n_mcp_webhook_secret_prod");

        if (!webhookUrl) throw new Error(`Webhook URL n8n não configurada para ${env}`);

        const eventPayload = { workflow_key: `event_${type}`, args: payload, trace_id: traceId, source: "lovable_mcp", env, event_type: type };
        const bodyStr = JSON.stringify(eventPayload);
        const headers: Record<string, string> = { "Content-Type": "application/json", "X-MCP-Trace-Id": traceId };
        if (webhookSecret) headers["X-MCP-Signature"] = await hmacSign(bodyStr, webhookSecret);

        const resp = await fetch(webhookUrl, { method: "POST", headers, body: bodyStr });
        const text = await resp.text();
        let result: any;
        try { result = JSON.parse(text); } catch { result = { raw: text }; }

        await auditLog(env, "lovable", `event.${type}`, traceId, body, result, resp.ok, resp.ok ? null : text.substring(0, 500), ip);
        return jsonResponse({ ok: resp.ok, trace_id: traceId, result });
      } catch (err: any) {
        await auditLog(env, "lovable", `event.${type}`, traceId, body, null, false, err.message, ip);
        return jsonResponse({ ok: false, trace_id: traceId, error: err.message }, 500);
      }
    }

    return jsonResponse({ error: "Rota não encontrada", routes: ["/mcp-hub/health", "/mcp-hub/tools", "/mcp-hub/call", "/mcp-hub/events"] }, 404);
  } catch (err: any) {
    console.error("MCP Hub error:", err);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});
