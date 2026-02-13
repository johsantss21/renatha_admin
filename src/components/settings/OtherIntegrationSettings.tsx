import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function OtherIntegrationSettings() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrações Futuras</CardTitle>
          <CardDescription>Módulos que serão configuráveis quando ativados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: 'API Logística', desc: 'Integração com transportadoras e rastreamento de entregas' },
            { name: 'Gateway de E-mail (SMTP)', desc: 'Envio de notificações por e-mail' },
            { name: 'Notificações Externas', desc: 'Push notifications e integração com serviços de mensageria' },
          ].map(item => (
            <div key={item.name} className="flex items-start justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Badge variant="outline">Em breve</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
