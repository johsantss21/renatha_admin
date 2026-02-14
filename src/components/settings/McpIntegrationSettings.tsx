import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Loader2, Save, Play, RefreshCw, Download, Shield, Zap, Key, List, FileText, Copy, Check, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const BASE_URL = 'https://infresxpaglulwiooanc.supabase.co/functions/v1/api';

const MCP_KEYS = [
  'mcp_enabled', 'mcp_allowlist_tools', 'mcp_rate_limit_per_minute',
] as const;

const ALL_TOOLS = [
  "lovable.customers.getByPhone", "lovable.customers.getByCpfCnpj", "lovable.customers.create", "lovable.customers.update",
  "lovable.products.list", "lovable.products.getByCode", "lovable.products.create", "lovable.products.update", "lovable.products.lowStock",
  "lovable.orders.create", "lovable.orders.get", "lovable.orders.cancel", "lovable.deliveries.getByDate",
  "lovable.subscriptions.create", "lovable.subscriptions.get", "lovable.subscriptions.update", "lovable.subscriptions.cancel",
  "lovable.settings.get", "lovable.settings.set",
];

type McpCreds = Record<string, string>;

interface AuditLog {
  id: string;
  created_at: string;
  env: string;
  actor: string;
  tool: string;
  trace_id: string | null;
  ok: boolean;
  error_message: string | null;
  request: any;
  response: any;
}

export function McpIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [creds, setCreds] = useState<McpCreds>({});
  const [allowlist, setAllowlist] = useState<string[]>([...ALL_TOOLS]);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  // API key from n8n settings
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState({ env: '', tool: '', ok: '' });
  const [auditPage, setAuditPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('system_settings').select('key, value').in('key', [...MCP_KEYS, 'n8n_token']);
      const c: McpCreds = {};
      for (const row of data || []) {
        let v = row.value;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
        if (row.key === 'mcp_allowlist_tools') {
          setAllowlist(Array.isArray(v) ? v.map(String) : [...ALL_TOOLS]);
        } else if (row.key === 'n8n_token') {
          setApiKey(typeof v === 'string' ? v : String(v ?? ''));
        } else {
          c[row.key] = typeof v === 'boolean' ? String(v) : String(v ?? '');
        }
      }
      setCreds(c);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
    toast({ title: 'Copiado!', description: 'Texto copiado para a área de transferência.' });
  };

  const saveSettings = async (keys: string[]) => {
    setSaving(true);
    try {
      for (const key of keys) {
        let value: any = creds[key];
        if (key === 'mcp_enabled') value = creds[key] === 'true';
        else if (key === 'mcp_rate_limit_per_minute') value = parseInt(creds[key]) || 60;
        await supabase.from('system_settings').upsert({ key, value: value as any, description: `MCP: ${key}` }, { onConflict: 'key' });
      }
      toast({ title: 'MCP salvo', description: 'Configurações MCP atualizadas.' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Erro', description: e.message }); }
    finally { setSaving(false); }
  };

  const saveAllowlist = async () => {
    setSaving(true);
    try {
      await supabase.from('system_settings').upsert({ key: 'mcp_allowlist_tools', value: allowlist as any, description: 'Lista de tools MCP permitidas' }, { onConflict: 'key' });
      toast({ title: 'Allowlist salva', description: 'Permissões de tools atualizadas.' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Erro', description: e.message }); }
    finally { setSaving(false); }
  };

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      let query = supabase.from('mcp_audit_logs' as any).select('*').order('created_at', { ascending: false }).range(auditPage * PAGE_SIZE, (auditPage + 1) * PAGE_SIZE - 1);
      if (auditFilter.env) query = query.eq('env', auditFilter.env);
      if (auditFilter.tool) query = query.ilike('tool', `%${auditFilter.tool}%`);
      if (auditFilter.ok === 'true') query = query.eq('ok', true);
      else if (auditFilter.ok === 'false') query = query.eq('ok', false);
      const { data } = await query;
      setAuditLogs((data || []) as any[]);
    } catch (e) { console.error(e); }
    finally { setAuditLoading(false); }
  }, [auditPage, auditFilter]);

  const exportCsv = () => {
    const header = 'id,created_at,env,actor,tool,trace_id,ok,error_message\n';
    const rows = auditLogs.map(l => `${l.id},${l.created_at},${l.env},${l.actor},${l.tool},${l.trace_id || ''},${l.ok},${(l.error_message || '').replace(/,/g, ';')}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mcp-audit-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const runTests = async () => {
    setTesting(true);
    setTestResults([]);
    const results: any[] = [];

    const tests = [
      { name: 'GET /mcp/health', fn: () => fetch(`${BASE_URL}/mcp/health`, { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }) },
      { name: 'GET /mcp/tools', fn: () => fetch(`${BASE_URL}/mcp/tools`, { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }) },
      { name: 'POST /mcp/call products.list', fn: () => fetch(`${BASE_URL}/mcp/call`, { method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: 'lovable.products.list', args: { include_inactive: false }, trace_id: `test-${Date.now()}` }) }) },
    ];

    for (const test of tests) {
      try {
        const resp = await test.fn();
        const data = await resp.json();
        results.push({ name: test.name, status: resp.status, ok: resp.ok, data });
      } catch (e: any) {
        results.push({ name: test.name, status: 0, ok: false, data: { error: e.message } });
      }
      setTestResults([...results]);
    }
    setTesting(false);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const mcpEnabled = creds.mcp_enabled === 'true';

  const n8nExample = `URL:\n${BASE_URL}/mcp/call\n\nHeaders:\nx-api-key: ${apiKey || 'SUA_CHAVE_AQUI'}\nContent-Type: application/json\n\nBody:\n{\n  "tool": "lovable.products.list",\n  "args": { "include_inactive": false }\n}`;

  return (
    <div className="space-y-6">
      {/* 🔐 Credenciais MCP */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🔐 Credenciais MCP</CardTitle>
          <CardDescription>Use estas credenciais para conectar o n8n ou qualquer cliente MCP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Base URL */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">Base URL MCP</Label>
            <div className="flex gap-2">
              <Input readOnly value={BASE_URL} className="font-mono text-xs bg-muted" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(BASE_URL, 'url')}>
                {copied['url'] ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">API Key (x-api-key)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                className="font-mono text-xs bg-muted"
              />
              <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey, 'apikey')}>
                {copied['apikey'] ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Mesmo valor do secret N8N_API_KEY configurado nas integrações n8n.</p>
          </div>

          {/* Exemplo n8n */}
          <div className="space-y-1">
            <Label className="text-sm font-medium">Exemplo pronto para n8n</Label>
            <div className="relative">
              <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 font-mono">{n8nExample}</pre>
              <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => copyToClipboard(n8nExample, 'example')}>
                {copied['example'] ? <><Check className="h-3 w-3 mr-1" />Copiado</> : <><Copy className="h-3 w-3 mr-1" />Copiar</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="geral" className="gap-1.5"><Zap className="h-4 w-4" />Geral</TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5"><List className="h-4 w-4" />Tools / Permissões</TabsTrigger>
          <TabsTrigger value="examples" className="gap-1.5"><ExternalLink className="h-4 w-4" />Exemplos n8n</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="h-4 w-4" />Auditoria</TabsTrigger>
        </TabsList>

        {/* ====== GERAL ====== */}
        <TabsContent value="geral">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Configurações MCP</CardTitle><CardDescription>Rotas MCP dentro de /api (health, tools, call, events/publish)</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div><Label className="text-base">Ativar MCP</Label><p className="text-sm text-muted-foreground">Habilita as rotas /api/mcp/*</p></div>
                  <Switch checked={mcpEnabled} onCheckedChange={v => setCreds(p => ({ ...p, mcp_enabled: String(v) }))} />
                </div>
                <div className="space-y-1">
                  <Label>Rate Limit (req/min)</Label>
                  <Input type="number" value={creds.mcp_rate_limit_per_minute || '60'} onChange={e => setCreds(p => ({ ...p, mcp_rate_limit_per_minute: e.target.value }))} className="max-w-xs" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveSettings(['mcp_enabled', 'mcp_rate_limit_per_minute'])} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar
                  </Button>
                  <Button variant="outline" onClick={runTests} disabled={testing}>
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Testar MCP
                  </Button>
                </div>
              </CardContent>
            </Card>

            {testResults.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Resultados dos Testes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {testResults.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border">
                        <Badge variant={r.ok ? 'default' : 'destructive'}>{r.status}</Badge>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{r.name}</p>
                          <pre className="text-xs mt-1 text-muted-foreground overflow-auto max-h-24">{JSON.stringify(r.data, null, 2)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ====== TOOLS / PERMISSÕES ====== */}
        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-5 w-5" />Allowlist de Tools</CardTitle>
              <CardDescription>Marque/desmarque as tools que o MCP pode executar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {ALL_TOOLS.map(tool => (
                  <label key={tool} className="flex items-center gap-2 text-sm p-1.5 rounded hover:bg-muted cursor-pointer">
                    <Checkbox
                      checked={allowlist.includes(tool)}
                      onCheckedChange={checked => {
                        setAllowlist(prev => checked ? [...prev, tool] : prev.filter(t => t !== tool));
                      }}
                    />
                    <code className="text-xs">{tool}</code>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={saveAllowlist} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar Allowlist
                </Button>
                <Button variant="outline" onClick={() => { setAllowlist([...ALL_TOOLS]); toast({ title: 'Allowlist restaurada', description: 'Todas as tools foram habilitadas.' }); }}>
                  <RefreshCw className="mr-2 h-4 w-4" />Restaurar Padrão
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== EXEMPLOS N8N ====== */}
        <TabsContent value="examples">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Listar Tools</CardTitle></CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="text-xs bg-muted rounded-md p-3 font-mono">{`GET ${BASE_URL}/mcp/tools\n\nHeaders:\n  x-api-key: ${apiKey || 'SUA_CHAVE'}\n  Content-Type: application/json`}</pre>
                  <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => copyToClipboard(`GET ${BASE_URL}/mcp/tools`, 'ex-tools')}>
                    {copied['ex-tools'] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Executar Tool</CardTitle></CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="text-xs bg-muted rounded-md p-3 font-mono">{`POST ${BASE_URL}/mcp/call\n\nHeaders:\n  x-api-key: ${apiKey || 'SUA_CHAVE'}\n  Content-Type: application/json\n\nBody:\n{\n  "tool": "lovable.products.list",\n  "args": { "include_inactive": false }\n}`}</pre>
                  <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => copyToClipboard(`POST ${BASE_URL}/mcp/call\n\n{"tool":"lovable.products.list","args":{"include_inactive":false}}`, 'ex-call')}>
                    {copied['ex-call'] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Publicar Evento</CardTitle></CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="text-xs bg-muted rounded-md p-3 font-mono">{`POST ${BASE_URL}/mcp/events/publish\n\nHeaders:\n  x-api-key: ${apiKey || 'SUA_CHAVE'}\n  Content-Type: application/json\n\nBody:\n{\n  "type": "order.paid",\n  "payload": { "order_id": "..." },\n  "trace_id": "opcional"\n}`}</pre>
                  <Button variant="outline" size="sm" className="absolute top-2 right-2" onClick={() => copyToClipboard(`POST ${BASE_URL}/mcp/events/publish`, 'ex-events')}>
                    {copied['ex-events'] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ====== AUDITORIA ====== */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" />Logs de Auditoria MCP</CardTitle>
              <CardDescription>Registros de todas as chamadas MCP</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Select value={auditFilter.env || 'all'} onValueChange={v => setAuditFilter(p => ({ ...p, env: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Ambiente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="prod">Prod</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Filtrar tool..." className="w-48" value={auditFilter.tool} onChange={e => setAuditFilter(p => ({ ...p, tool: e.target.value }))} />
                <Select value={auditFilter.ok || 'all'} onValueChange={v => setAuditFilter(p => ({ ...p, ok: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="true">✅ OK</SelectItem>
                    <SelectItem value="false">❌ Erro</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchAuditLogs} disabled={auditLoading}>
                  {auditLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Buscar
                </Button>
                <Button variant="outline" onClick={exportCsv} disabled={auditLogs.length === 0}>
                  <Download className="mr-2 h-4 w-4" />Exportar CSV
                </Button>
              </div>

              {auditLogs.length > 0 ? (
                <>
                  <div className="overflow-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-36">Data</TableHead>
                          <TableHead>Env</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Tool</TableHead>
                          <TableHead>OK</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.map(log => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs">{new Date(log.created_at).toLocaleString('pt-BR')}</TableCell>
                            <TableCell><Badge variant={log.env === 'prod' ? 'default' : 'secondary'}>{log.env}</Badge></TableCell>
                            <TableCell className="text-xs">{log.actor}</TableCell>
                            <TableCell className="text-xs font-mono">{log.tool}</TableCell>
                            <TableCell>{log.ok ? '✅' : '❌'}</TableCell>
                            <TableCell className="text-xs text-destructive max-w-48 truncate">{log.error_message || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}>Anterior</Button>
                    <span className="text-sm text-muted-foreground py-2">Página {auditPage + 1}</span>
                    <Button variant="outline" size="sm" disabled={auditLogs.length < PAGE_SIZE} onClick={() => setAuditPage(p => p + 1)}>Próxima</Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum log encontrado. Clique em "Buscar" para carregar.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
