import { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Save, Wifi, WifiOff, Upload, Shield, FileKey, AlertTriangle, Check, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CertificateInfo {
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  storage_path: string;
}

const CERT_TYPES = [
  { key: 'pix_cert_crt', label: 'Certificado (.crt)', accept: '.crt', description: 'Certificado público para mTLS — usado por: Banco Inter' },
  { key: 'pix_cert_key', label: 'Chave Privada (.key)', accept: '.key', description: 'Chave privada do certificado — usado por: Banco Inter (par do .crt)' },
  { key: 'pix_cert_p12', label: 'Certificado (.p12)', accept: '.p12', description: 'Certificado PKCS#12 — usado por: EFI (Gerencianet), Sicoob, Sicredi' },
  { key: 'pix_cert_pem', label: 'Certificado (.pem)', accept: '.pem', description: 'Certificado PEM (cert + chave em um arquivo) — usado por: Itaú, Bradesco e outros' },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const PROD_KEYS = ['pix_client_id', 'pix_client_secret', 'pix_key'] as const;
const HML_KEYS = ['pix_client_id_hml', 'pix_client_secret_hml', 'pix_key_hml'] as const;

export function PixIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [ambienteAtivo, setAmbienteAtivo] = useState('producao');
  const [creds, setCreds] = useState<Record<string, string>>({
    pix_client_id: '', pix_client_secret: '', pix_key: '',
    pix_client_id_hml: '', pix_client_secret_hml: '', pix_key_hml: '',
  });
  const [certificates, setCertificates] = useState<Record<string, CertificateInfo | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const allKeys = [...PROD_KEYS, ...HML_KEYS, 'ambiente_ativo_pix', 'pix_certificates_meta'];
      const { data } = await supabase.from('system_settings').select('key, value').in('key', allKeys);
      const map = new Map(data?.map(s => [s.key, s.value]) || []);

      setCreds(prev => {
        const u = { ...prev };
        for (const k of [...PROD_KEYS, ...HML_KEYS]) if (map.has(k)) u[k] = (map.get(k) as string) || '';
        return u;
      });
      setAmbienteAtivo((map.get('ambiente_ativo_pix') as string) || 'producao');
      setCertificates((map.get('pix_certificates_meta') as unknown as Record<string, CertificateInfo>) || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const entries = { ...creds, ambiente_ativo_pix: ambienteAtivo };
      for (const [key, value] of Object.entries(entries)) {
        await supabase.from('system_settings').upsert({ key, value: value as any, description: `Pix: ${key}` }, { onConflict: 'key' });
      }
      toast({ title: 'Pix salvo', description: 'Credenciais Pix atualizadas.' });
      await testConnection();
    } catch (e: any) { toast({ variant: 'destructive', title: 'Erro', description: e.message }); }
    finally { setSaving(false); }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-pix-connection');
      if (error) throw error;
      if (data?.success) {
        setConnectionStatus({ success: true, message: data.message });
        toast({ title: '✅ Conexão OK', description: data.message });
      } else {
        setConnectionStatus({ success: false, message: data?.error || 'Falha na conexão' });
        toast({ variant: 'destructive', title: 'Falha', description: data?.error });
      }
    } catch (e: any) {
      setConnectionStatus({ success: false, message: e.message });
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    } finally { setTestingConnection(false); }
  };

  const handleFileUpload = async (certKey: string, file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande', description: 'O arquivo deve ter no máximo 5MB.' });
      return;
    }
    const allowedExtensions = CERT_TYPES.find(c => c.key === certKey)?.accept?.split(',').map(e => e.trim()) || [];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      toast({ variant: 'destructive', title: 'Formato inválido', description: `Apenas ${allowedExtensions.join(', ')} são aceitos.` });
      return;
    }

    setUploading(certKey);
    try {
      const storagePath = `certificates/${certKey}${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('bank-certificates').upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const newCertInfo: CertificateInfo = {
        filename: file.name,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.email || 'admin',
        storage_path: storagePath,
      };
      const updatedMeta = { ...certificates, [certKey]: newCertInfo };
      await supabase.from('system_settings').upsert({
        key: 'pix_certificates_meta', value: updatedMeta as any, description: 'Metadados dos certificados bancários',
      }, { onConflict: 'key' });
      setCertificates(updatedMeta);
      toast({ title: 'Certificado enviado', description: `${file.name} armazenado com segurança.` });
      await testConnection();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro no upload', description: e.message });
    } finally { setUploading(null); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const renderField = (label: string, key: string, isSecret = false) => (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <Input
          type={isSecret && !showSecrets[key] ? 'password' : 'text'}
          value={creds[key] || ''}
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
      <Alert className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <AlertDescription className="text-sm">
          Esses arquivos e credenciais são sigilosos. Não compartilhe com terceiros.
        </AlertDescription>
      </Alert>

      {connectionStatus && (
        <Alert className={connectionStatus.success ? 'border-primary/50 bg-primary/10' : 'border-destructive/50 bg-destructive/10'}>
          {connectionStatus.success ? <Wifi className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-destructive" />}
          <AlertDescription className="text-sm">{connectionStatus.message}</AlertDescription>
        </Alert>
      )}

      {/* Ambiente Ativo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ambiente Ativo</CardTitle></CardHeader>
        <CardContent>
          <Select value={ambienteAtivo} onValueChange={setAmbienteAtivo}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="producao">🟢 Produção</SelectItem>
              <SelectItem value="homologacao">🟡 Homologação</SelectItem>
            </SelectContent>
          </Select>
          {ambienteAtivo === 'homologacao' && (
            <Alert className="mt-3 border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Ambiente de homologação ativo. Cobranças serão geradas na sandbox Efí.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Produção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> 🟢 Produção
            {ambienteAtivo === 'producao' && <Badge>Ativo</Badge>}
          </CardTitle>
          <CardDescription>Credenciais da API Pix Efí – Produção</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Client ID', 'pix_client_id')}
          {renderField('Client Secret', 'pix_client_secret', true)}
          {renderField('Chave Pix', 'pix_key')}
        </CardContent>
      </Card>

      {/* Homologação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> 🟡 Homologação
            {ambienteAtivo === 'homologacao' && <Badge variant="secondary">Ativo</Badge>}
          </CardTitle>
          <CardDescription>Credenciais da API Pix Efí – Testes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderField('Client ID (Teste)', 'pix_client_id_hml')}
          {renderField('Client Secret (Teste)', 'pix_client_secret_hml', true)}
          {renderField('Chave Pix (Teste)', 'pix_key_hml')}
        </CardContent>
      </Card>

      {/* Certificados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileKey className="h-4 w-4" /> Certificados Digitais</CardTitle>
          <CardDescription>
            Upload de certificados para autenticação mTLS.<br />
            <strong>EFI:</strong> .p12 | <strong>Banco Inter:</strong> .crt + .key | <strong>Itaú/Bradesco:</strong> .pem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CERT_TYPES.map(cert => {
            const info = certificates[cert.key] as CertificateInfo | null | undefined;
            return (
              <div key={cert.key} className="flex items-start justify-between rounded-lg border p-4 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Label className="text-sm font-medium">{cert.label}</Label>
                    {info && <Badge variant="secondary" className="text-xs">Enviado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{cert.description}</p>
                  {info && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Arquivo: <span className="font-mono">{info.filename}</span></p>
                      <p>Enviado em: {new Date(info.uploaded_at).toLocaleString('pt-BR')}</p>
                      <p>Por: {info.uploaded_by}</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline" size="sm" disabled={uploading === cert.key}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file'; input.accept = cert.accept;
                    input.onchange = e => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleFileUpload(cert.key, file);
                    };
                    input.click();
                  }}
                >
                  {uploading === cert.key ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <><Upload className="h-4 w-4 mr-1" />{info ? 'Substituir' : 'Enviar'}</>
                  )}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar Configurações Pix
        </Button>
        <Button variant="outline" onClick={testConnection} disabled={testingConnection}>
          {testingConnection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
          Testar Conexão
        </Button>
      </div>
    </div>
  );
}
