import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const KEYS = [
  'n8n_endpoint', 'n8n_token',
  'n8n_endpoint_hml', 'n8n_token_hml',
  'ambiente_ativo_n8n',
] as const;

type N8nCreds = Record<typeof KEYS[number], string>;

export function N8nIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<N8nCreds>({
    n8n_endpoint: '', n8n_token: '',
    n8n_endpoint_hml: '', n8n_token_hml: '',
    ambiente_ativo_n8n: 'producao',
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('system_settings').select('key, value').in('key', [...KEYS]);
      const map = new Map(data?.map(s => [s.key, s.value]) || []);
      setCreds(prev => {
        const u = { ...prev };
        for (const k of KEYS) if (map.has(k)) u[k] = (map.get(k) as string) || '';
        return u;
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(creds)) {
        await supabase.from('system_settings').upsert({ key, value: value as any, description: `n8n: ${key}` }, { onConflict: 'key' });
      }
      toast({ title: 'n8n salvo', description: 'Configurações n8n atualizadas.' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Erro', description: e.message }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const renderField = (label: string, key: typeof KEYS[number], isSecret = false) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          type={isSecret && !showSecrets[key] ? 'password' : 'text'}
          value={creds[key]}
          onChange={e => setCreds(p => ({ ...p, [key]: e.target.value }))}
          placeholder={label}
        />
        {isSecret && (
          <Button type="button" variant="outline" size="icon" onClick={() => setShowSecrets(p => ({ ...p, [key]: !p[key] }))}>
            {showSecrets[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Ambiente Ativo</CardTitle></CardHeader>
        <CardContent>
          <Select value={creds.ambiente_ativo_n8n} onValueChange={v => setCreds(p => ({ ...p, ambiente_ativo_n8n: v }))}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">🟢 Produção</SelectItem>
              <SelectItem value="homologacao">🟡 Homologação</SelectItem>
            </SelectContent>
          </Select>
          {creds.ambiente_ativo_n8n === 'homologacao' && (
            <Alert className="mt-3 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">⚠️ Ambiente de homologação ativo.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🟢 Produção {creds.ambiente_ativo_n8n === 'producao' && <Badge>Ativo</Badge>}</CardTitle>
          <CardDescription>Endpoint e token de produção do n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Endpoint', 'n8n_endpoint')}
          {renderField('Token', 'n8n_token', true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🟡 Homologação {creds.ambiente_ativo_n8n === 'homologacao' && <Badge variant="secondary">Ativo</Badge>}</CardTitle>
          <CardDescription>Endpoint e token de testes do n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Endpoint (Teste)', 'n8n_endpoint_hml')}
          {renderField('Token (Teste)', 'n8n_token_hml', true)}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar Configurações n8n
      </Button>
    </div>
  );
}
