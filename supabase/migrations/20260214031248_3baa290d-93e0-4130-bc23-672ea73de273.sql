
-- Create mcp_audit_logs table
CREATE TABLE public.mcp_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  env TEXT NOT NULL DEFAULT 'prod' CHECK (env IN ('prod', 'hml')),
  actor TEXT NOT NULL DEFAULT 'system',
  tool TEXT NOT NULL,
  trace_id TEXT,
  request JSONB,
  response JSONB,
  ok BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  ip TEXT
);

-- Enable RLS
ALTER TABLE public.mcp_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin can read audit logs
CREATE POLICY "Admins can read mcp audit logs"
ON public.mcp_audit_logs
FOR SELECT
USING (public.is_admin());

-- Service role (edge functions) can insert - no policy needed as service role bypasses RLS

-- Index for common queries
CREATE INDEX idx_mcp_audit_logs_created_at ON public.mcp_audit_logs (created_at DESC);
CREATE INDEX idx_mcp_audit_logs_tool ON public.mcp_audit_logs (tool);
CREATE INDEX idx_mcp_audit_logs_env ON public.mcp_audit_logs (env);

-- Seed MCP settings keys in system_settings (upsert to not break existing)
INSERT INTO public.system_settings (key, value, description) VALUES
  ('mcp_enabled', 'true', 'Habilitar/desabilitar o Hub MCP'),
  ('mcp_shared_secret_prod', '""', 'Segredo Bearer para chamadas MCP em produção'),
  ('mcp_shared_secret_hml', '""', 'Segredo Bearer para chamadas MCP em homologação'),
  ('mcp_allowlist_tools', '["lovable.customers.getByPhone","lovable.customers.getByCpfCnpj","lovable.customers.create","lovable.customers.update","lovable.products.list","lovable.products.getByCode","lovable.products.create","lovable.products.update","lovable.products.lowStock","lovable.orders.create","lovable.orders.get","lovable.orders.cancel","lovable.deliveries.getByDate","lovable.subscriptions.create","lovable.subscriptions.get","lovable.subscriptions.update","lovable.subscriptions.cancel","lovable.settings.get","lovable.settings.set","n8n.workflow.trigger","n8n.customer.message.send","n8n.admin.message.send","n8n.deliveries.report.send","n8n.stock.alert.send"]', 'Lista de tools MCP permitidas'),
  ('mcp_rate_limit_per_minute', '60', 'Limite de requisições MCP por minuto'),
  ('mcp_env_mode', '"prod"', 'Ambiente MCP ativo: prod ou hml'),
  ('n8n_mcp_webhook_url_prod', '""', 'Webhook do n8n para triggers MCP em produção'),
  ('n8n_mcp_webhook_url_hml', '""', 'Webhook do n8n para triggers MCP em homologação'),
  ('n8n_mcp_webhook_secret_prod', '""', 'Segredo HMAC para assinar chamadas Lovable→n8n em produção'),
  ('n8n_mcp_webhook_secret_hml', '""', 'Segredo HMAC para assinar chamadas Lovable→n8n em homologação'),
  ('n8n_api_key_prod', '""', 'API key n8n produção (reservado)'),
  ('n8n_api_key_hml', '""', 'API key n8n homologação (reservado)')
ON CONFLICT (key) DO NOTHING;
