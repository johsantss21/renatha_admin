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
  'token_sefaz', 'acesso_receita', 'acesso_sintegra',
  'token_sefaz_hml', 'acesso_receita_hml', 'acesso_sintegra_hml',
  'ambiente_ativo_fiscais',
] as const;

type Creds = Record<typeof KEYS[number], string>;

export function SefazIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [creds, setCreds] = useState<Creds>({
    token_sefaz: '', acesso_receita: '', acesso_sintegra: '',
    token_sefaz_hml: '', acesso_receita_hml: '', acesso_sintegra_hml: '',
    ambiente_ativo_fiscais: 'producao',
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
        await supabase.from('system_settings').upsert({ key, value: value as any, description: `Fiscal: ${key}` }, { onConflict: 'key' });
      }
      toast({ title: 'Configurações fiscais salvas' });
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
          <Select value={creds.ambiente_ativo_fiscais} onValueChange={v => setCreds(p => ({ ...p, ambiente_ativo_fiscais: v }))}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">🟢 Produção</SelectItem>
              <SelectItem value="homologacao">🟡 Homologação</SelectItem>
            </SelectContent>
          </Select>
          {creds.ambiente_ativo_fiscais === 'homologacao' && (
            <Alert className="mt-3 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">⚠️ Ambiente de homologação ativo para integrações fiscais.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🟢 Produção {creds.ambiente_ativo_fiscais === 'producao' && <Badge>Ativo</Badge>}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Token SEFAZ', 'token_sefaz', true)}
          {renderField('Acesso Receita Federal', 'acesso_receita', true)}
          {renderField('Acesso Sintegra', 'acesso_sintegra', true)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">🟡 Homologação {creds.ambiente_ativo_fiscais === 'homologacao' && <Badge variant="secondary">Ativo</Badge>}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Token SEFAZ (Teste)', 'token_sefaz_hml', true)}
          {renderField('Acesso Receita (Teste)', 'acesso_receita_hml', true)}
          {renderField('Acesso Sintegra (Teste)', 'acesso_sintegra_hml', true)}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar Configurações Fiscais
      </Button>
    </div>
  );
}
