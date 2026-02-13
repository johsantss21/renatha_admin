import { useState, useEffect } from 'react';
import { Shield, Upload, Eye, EyeOff, FileKey, AlertTriangle, Check, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CertificateInfo {
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  storage_path: string;
}

interface BankCredentials {
  pix_client_id: string;
  pix_client_secret: string;
  pix_key: string;
}

const CERT_TYPES = [
  { key: 'pix_cert_crt', label: 'Certificado (.crt)', accept: '.crt', description: 'Certificado público para mTLS — usado por: Banco Inter' },
  { key: 'pix_cert_key', label: 'Chave Privada (.key)', accept: '.key', description: 'Chave privada do certificado — usado por: Banco Inter (par do .crt)' },
  { key: 'pix_cert_p12', label: 'Certificado (.p12)', accept: '.p12', description: 'Certificado PKCS#12 — usado por: EFI (Gerencianet), Sicoob, Sicredi' },
  { key: 'pix_cert_pem', label: 'Certificado (.pem)', accept: '.pem', description: 'Certificado PEM (cert + chave em um arquivo) — usado por: Itaú, Bradesco e outros' },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function BankIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [credentials, setCredentials] = useState<BankCredentials>({
    pix_client_id: '',
    pix_client_secret: '',
    pix_key: '',
  });
  const [originalCredentials, setOriginalCredentials] = useState<BankCredentials>({
    pix_client_id: '',
    pix_client_secret: '',
    pix_key: '',
  });
  const [editingCredentials, setEditingCredentials] = useState(false);
  const [certificates, setCertificates] = useState<Record<string, CertificateInfo | null>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['pix_client_id', 'pix_client_secret', 'pix_key', 'pix_certificates_meta']);

      const settingsMap = new Map(settings?.map(s => [s.key, s.value]) || []);
      
      const creds = {
        pix_client_id: (settingsMap.get('pix_client_id') as string) || '',
        pix_client_secret: (settingsMap.get('pix_client_secret') as string) || '',
        pix_key: (settingsMap.get('pix_key') as string) || '',
      };
      setCredentials(creds);
      setOriginalCredentials(creds);

      const certMeta = (settingsMap.get('pix_certificates_meta') as unknown as Record<string, CertificateInfo>) || {};
      setCertificates(certMeta);
    } catch (error) {
      console.error('Error fetching bank settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const logAuditEvent = async (action: string, details: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('system_settings').upsert({
        key: 'pix_audit_log',
        value: {
          last_action: action,
          details,
          user_email: user?.email || 'unknown',
          timestamp: new Date().toISOString(),
        } as any,
        description: 'Último log de auditoria de alteração de credenciais/certificados Pix',
      }, { onConflict: 'key' });
    } catch (err) {
      console.error('Error logging audit event:', err);
    }
  };

  const saveCredentials = async () => {
    setSaving(true);
    try {
      const credentialsToSave = [
        { key: 'pix_client_id', value: credentials.pix_client_id, description: 'Client ID do Banco Inter para API Pix' },
        { key: 'pix_client_secret', value: credentials.pix_client_secret, description: 'Client Secret do Banco Inter para API Pix' },
        { key: 'pix_key', value: credentials.pix_key, description: 'Chave Pix da empresa para cobranças' },
      ];

      for (const setting of credentialsToSave) {
        const { error } = await supabase
          .from('system_settings')
          .upsert({
            key: setting.key,
            value: setting.value as any,
            description: setting.description,
          }, { onConflict: 'key' });
        if (error) throw error;
      }

      const changedFields: string[] = [];
      if (credentials.pix_client_id !== originalCredentials.pix_client_id) changedFields.push('client_id');
      if (credentials.pix_client_secret !== originalCredentials.pix_client_secret) changedFields.push('client_secret');
      if (credentials.pix_key !== originalCredentials.pix_key) changedFields.push('pix_key');

      await logAuditEvent('credentials_updated', `Campos alterados: ${changedFields.join(', ')}`);

      setOriginalCredentials({ ...credentials });
      setEditingCredentials(false);
      setConnectionStatus(null);
      toast({ title: 'Credenciais salvas', description: 'As credenciais bancárias foram atualizadas. Teste a conexão para validar.' });

      // Auto-test connection after saving
      await testConnection();
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível salvar as credenciais.' });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setCredentials({ ...originalCredentials });
    setEditingCredentials(false);
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
        toast({ variant: 'destructive', title: 'Falha na conexão', description: data?.error });
      }
    } catch (error: any) {
      const msg = error.message || 'Erro ao testar conexão';
      setConnectionStatus({ success: false, message: msg });
      toast({ variant: 'destructive', title: 'Erro', description: msg });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFileUpload = async (certKey: string, file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande', description: 'O arquivo deve ter no máximo 5MB.' });
      return;
    }

    const allowedExtensions = CERT_TYPES.find(c => c.key === certKey)?.accept?.split(',').map(e => e.trim()) || [];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      toast({ variant: 'destructive', title: 'Formato inválido', description: `Apenas arquivos ${allowedExtensions.join(', ')} são aceitos.` });
      return;
    }

    setUploading(certKey);
    try {
      const storagePath = `certificates/${certKey}${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('bank-certificates')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { user } } = await supabase.auth.getUser();
      const newCertInfo: CertificateInfo = {
        filename: file.name,
        uploaded_at: new Date().toISOString(),
        uploaded_by: user?.email || 'admin',
        storage_path: storagePath,
      };

      const updatedMeta = { ...certificates, [certKey]: newCertInfo };
      
      const { error: metaError } = await supabase
        .from('system_settings')
        .upsert({
          key: 'pix_certificates_meta',
          value: updatedMeta as any,
          description: 'Metadados dos certificados bancários uploadados',
        }, { onConflict: 'key' });

      if (metaError) throw metaError;

      setCertificates(updatedMeta);
      setConnectionStatus(null);

      await logAuditEvent('certificate_uploaded', `Certificado ${certKey} atualizado: ${file.name}`);

      toast({ title: 'Certificado enviado', description: `${file.name} foi armazenado com segurança.` });

      // Auto-test connection after cert upload
      await testConnection();
    } catch (error: any) {
      console.error('Error uploading certificate:', error);
      toast({ variant: 'destructive', title: 'Erro no upload', description: error.message || 'Não foi possível enviar o arquivo.' });
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <AlertDescription className="text-sm">
          Esses arquivos e credenciais são sigilosos e usados apenas para autenticação mTLS em integrações bancárias. Não compartilhe com terceiros.
        </AlertDescription>
      </Alert>

      {/* Connection Status */}
      {connectionStatus && (
        <Alert className={connectionStatus.success ? 'border-primary/50 bg-primary/10' : 'border-destructive/50 bg-destructive/10'}>
          {connectionStatus.success ? (
            <Wifi className="h-4 w-4 text-primary" />
          ) : (
            <WifiOff className="h-4 w-4 text-destructive" />
          )}
          <AlertDescription className="text-sm">
            {connectionStatus.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Credentials Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Credenciais da API Pix
          </CardTitle>
          <CardDescription>Client ID, Client Secret e Chave Pix para integração bancária</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label>Client ID</Label>
              <Input
                value={credentials.pix_client_id}
                onChange={(e) => setCredentials(prev => ({ ...prev, pix_client_id: e.target.value }))}
                disabled={!editingCredentials}
                placeholder="Insira o Client ID"
              />
            </div>

            <div>
              <Label>Client Secret</Label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={credentials.pix_client_secret}
                  onChange={(e) => setCredentials(prev => ({ ...prev, pix_client_secret: e.target.value }))}
                  disabled={!editingCredentials}
                  placeholder="Insira o Client Secret"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <Label>Chave Pix</Label>
              <Input
                value={credentials.pix_key}
                onChange={(e) => setCredentials(prev => ({ ...prev, pix_key: e.target.value }))}
                disabled={!editingCredentials}
                placeholder="Chave Pix da empresa (CPF, CNPJ, e-mail, telefone ou EVP)"
              />
            </div>
          </div>

          <div className="flex gap-2">
            {editingCredentials ? (
              <>
                <Button onClick={saveCredentials} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Salvar credenciais
                </Button>
                <Button variant="outline" onClick={cancelEdit}>Cancelar</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditingCredentials(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Alterar credenciais
                </Button>
                <Button variant="outline" onClick={testConnection} disabled={testingConnection}>
                  {testingConnection ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wifi className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Certificates Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileKey className="h-5 w-5" />
            Certificados Digitais
          </CardTitle>
          <CardDescription>
            Upload de certificados para autenticação mTLS. Cada integração usa um formato diferente — envie apenas o(s) arquivo(s) exigido(s) pelo seu banco:
            <br /><strong>Banco Inter:</strong> .crt + .key &nbsp;|&nbsp; <strong>EFI:</strong> .p12 &nbsp;|&nbsp; <strong>Itaú/Bradesco:</strong> .pem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CERT_TYPES.map((cert) => {
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
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading === cert.key}
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = cert.accept;
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleFileUpload(cert.key, file);
                      };
                      input.click();
                    }}
                  >
                    {uploading === cert.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-1" />
                        {info ? 'Substituir' : 'Enviar'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
