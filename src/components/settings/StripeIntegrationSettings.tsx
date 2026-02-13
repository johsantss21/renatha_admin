import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Save, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StripeCredentials {
  stripe_publishable_key: string;
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  stripe_publishable_key_hml: string;
  stripe_secret_key_hml: string;
  stripe_webhook_secret_hml: string;
  ambiente_ativo_stripe: string;
}

export function StripeIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [credentials, setCredentials] = useState<StripeCredentials>({
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    stripe_publishable_key_hml: '',
    stripe_secret_key_hml: '',
    stripe_webhook_secret_hml: '',
    ambiente_ativo_stripe: 'producao',
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const keys = Object.keys(credentials);
      const { data } = await supabase.from('system_settings').select('key, value').in('key', keys);
      const map = new Map(data?.map(s => [s.key, s.value]) || []);
      setCredentials(prev => {
        const updated = { ...prev };
        for (const k of keys) {
          if (map.has(k)) updated[k as keyof StripeCredentials] = (map.get(k) as string) || '';
        }
        return updated;
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(credentials)) {
        await supabase.from('system_settings').upsert({ key, value: value as any, description: `Stripe: ${key}` }, { onConflict: 'key' });
      }
      toast({ title: 'Stripe salvo', description: 'Credenciais Stripe atualizadas.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    } finally { setSaving(false); }
  };

  const toggleShow = (k: string) => setShowSecrets(prev => ({ ...prev, [k]: !prev[k] }));
  const update = (k: keyof StripeCredentials, v: string) => setCredentials(prev => ({ ...prev, [k]: v }));

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const renderField = (label: string, key: keyof StripeCredentials, isSecret = false) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          type={isSecret && !showSecrets[key] ? 'password' : 'text'}
          value={credentials[key]}
          onChange={e => update(key, e.target.value)}
          placeholder={`Insira ${label}`}
        />
        {isSecret && (
          <Button type="button" variant="outline" size="icon" onClick={() => toggleShow(key)}>
            {showSecrets[key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Ambiente Ativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ambiente Ativo</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={credentials.ambiente_ativo_stripe} onValueChange={v => update('ambiente_ativo_stripe', v)}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">🟢 Produção</SelectItem>
              <SelectItem value="homologacao">🟡 Homologação</SelectItem>
            </SelectContent>
          </Select>
          {credentials.ambiente_ativo_stripe === 'homologacao' && (
            <Alert className="mt-3 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Ambiente de homologação ativo. Nenhuma cobrança real será efetuada.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Produção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🟢 Produção
            {credentials.ambiente_ativo_stripe === 'producao' && <Badge>Ativo</Badge>}
          </CardTitle>
          <CardDescription>Credenciais do ambiente de produção Stripe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Publishable Key', 'stripe_publishable_key')}
          {renderField('Secret Key', 'stripe_secret_key', true)}
          {renderField('Webhook Secret', 'stripe_webhook_secret', true)}
        </CardContent>
      </Card>

      {/* Homologação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            🟡 Homologação
            {credentials.ambiente_ativo_stripe === 'homologacao' && <Badge variant="secondary">Ativo</Badge>}
          </CardTitle>
          <CardDescription>Credenciais do ambiente de testes Stripe</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Publishable Key (Teste)', 'stripe_publishable_key_hml')}
          {renderField('Secret Key (Teste)', 'stripe_secret_key_hml', true)}
          {renderField('Webhook Secret (Teste)', 'stripe_webhook_secret_hml', true)}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar Configurações Stripe
      </Button>
    </div>
  );
}
