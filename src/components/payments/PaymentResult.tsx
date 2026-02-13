import { useState } from 'react';
import { Copy, Check, ExternalLink, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface PaymentResultProps {
  paymentMethod: 'cartao' | 'pix';
  paymentUrl?: string;
  pixCopiaECola?: string;
  isConfirmed?: boolean;
  isExpired?: boolean;
  mode?: string;
}

export function PaymentResult({ paymentMethod, paymentUrl, pixCopiaECola, isConfirmed, isExpired, mode }: PaymentResultProps) {
  const { toast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  const handleCopy = async (text: string, type: 'link' | 'pix') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') setCopiedLink(true);
      else setCopiedPix(true);
      toast({ title: 'Copiado!', description: 'Texto copiado para a área de transferência.' });
      setTimeout(() => {
        if (type === 'link') setCopiedLink(false);
        else setCopiedPix(false);
      }, 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível copiar.' });
    }
  };

  // Hide payment info when confirmed
  if (isConfirmed) {
    return (
      <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 space-y-2">
        <div className="flex items-center gap-2">
          <Check className="h-5 w-5 text-green-600" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Pagamento Confirmado
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          O pagamento foi recebido e processado com sucesso.
        </p>
      </div>
    );
  }

  // Hide payment info when expired
  if (isExpired) {
    return (
      <div className="p-4 border rounded-lg bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 space-y-2">
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-amber-600" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            QR Code / Link Expirado
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Gerando novo link de pagamento automaticamente...
        </p>
      </div>
    );
  }

  if (!paymentUrl && !pixCopiaECola) return null;

  const isJornada3 = mode === 'pix_automatico_jornada3';

  return (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          {paymentMethod === 'pix' ? <QrCode className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
          Pagamento Gerado
        </p>
        {isJornada3 && (
          <Badge variant="secondary" className="text-xs">
            Pix Automático (Jornada 3)
          </Badge>
        )}
      </div>

      {isJornada3 && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
          ℹ️ O cliente irá pagar o valor imediato e autorizar cobranças futuras automáticas ao escanear o QR Code.
        </div>
      )}

      {/* Payment Link */}
      {paymentUrl && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">🔗 Link para pagamento</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={paymentUrl}
              className="flex-1 text-xs bg-background border rounded px-3 py-2 truncate"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCopy(paymentUrl, 'link')}
            >
              {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              <span className="ml-1">{copiedLink ? 'Copiado' : 'Copiar'}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(paymentUrl, '_blank')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Pix Copia e Cola */}
      {paymentMethod === 'pix' && pixCopiaECola && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            🧾 {isJornada3 ? 'Pix Copia e Cola (pagamento + autorização de recorrência)' : 'Pix Copia e Cola'}
          </label>
          <div className="p-3 bg-background border rounded text-xs break-all font-mono">
            {pixCopiaECola}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => handleCopy(pixCopiaECola, 'pix')}
          >
            {copiedPix ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
            {copiedPix ? 'Copiado!' : 'Copiar código Pix'}
          </Button>

          {/* QR Code via API */}
          <div className="flex justify-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCopiaECola)}`}
              alt="QR Code Pix"
              className="w-48 h-48 border rounded"
            />
          </div>
        </div>
      )}

      {/* Manual send button */}
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        onClick={() => handleCopy(paymentUrl || pixCopiaECola || '', 'link')}
      >
        📤 Copiar link para enviar ao cliente
      </Button>

      {/* Generate PDF button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => {
          const printWindow = window.open('', '_blank');
          if (!printWindow) return;
          const qrUrl = pixCopiaECola ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopiaECola)}` : '';
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head><title>Dados de Pagamento</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
              .header h1 { font-size: 20px; margin: 0; }
              .header p { color: #666; margin: 5px 0 0; }
              .section { margin: 20px 0; }
              .section label { font-weight: bold; display: block; margin-bottom: 5px; font-size: 13px; color: #555; }
              .section .value { background: #f5f5f5; padding: 10px; border-radius: 6px; word-break: break-all; font-family: monospace; font-size: 12px; }
              .qr { text-align: center; margin: 20px 0; }
              .qr img { width: 250px; height: 250px; }
              .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #999; }
              @media print { body { padding: 20px; } }
            </style>
            </head>
            <body>
              <div class="header">
                <h1>JR HIDROPONICOS LTDA</h1>
                <p>Dados para Pagamento</p>
              </div>
              ${paymentUrl ? `<div class="section"><label>🔗 Link de Pagamento</label><div class="value">${paymentUrl}</div></div>` : ''}
              ${pixCopiaECola ? `
                <div class="section"><label>🧾 Pix Copia e Cola</label><div class="value">${pixCopiaECola}</div></div>
                <div class="qr"><img src="${qrUrl}" alt="QR Code Pix" /></div>
              ` : ''}
              ${isJornada3 ? '<div class="section"><p style="color:#1d4ed8;font-size:12px;">ℹ️ Ao escanear, o cliente autoriza o pagamento imediato e cobranças futuras automáticas.</p></div>' : ''}
              <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')}</div>
            </body>
            </html>
          `);
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }}
      >
        🖨️ Gerar PDF / Imprimir
      </Button>
    </div>
  );
}
