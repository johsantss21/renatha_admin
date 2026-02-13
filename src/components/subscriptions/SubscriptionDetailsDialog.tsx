import { useEffect, useState, useCallback } from 'react';
import { Loader2, CreditCard, Wallet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentResult } from '@/components/payments/PaymentResult';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Subscription, SubscriptionItem, SubscriptionStatus } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  onSuccess: () => void;
}

export function SubscriptionDetailsDialog({ open, onOpenChange, subscription, onSuccess }: SubscriptionDetailsDialogProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ method: 'cartao' | 'pix'; url?: string; pixCopiaECola?: string; mode?: string } | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus>('ativa');
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [justification, setJustification] = useState('');
  const [showJustification, setShowJustification] = useState(false);

  const isEmergency = !!(subscription as any)?.is_emergency;

  const checkPixPaymentStatus = useCallback(async () => {
    if (!subscription || status === 'ativa') return;
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-pix-payment', {
        body: { type: 'subscription', subscription_id: subscription.id },
      });
      if (error) throw error;
      if (data?.status === 'confirmado' && data?.updated) {
        setStatus('ativa');
        toast({ title: 'Pagamento confirmado!', description: 'O pagamento foi detectado e a assinatura ativada.' });
        onSuccess();
      } else if (data?.status === 'expirado') {
        setIsExpired(true);
        handleReissuePayment();
      }
    } catch (err) {
      console.error('Error checking payment:', err);
    } finally {
      setCheckingPayment(false);
    }
  }, [subscription, status]);

  const handleReissuePayment = async () => {
    if (!subscription || reissuing) return;
    setReissuing(true);
    try {
      const method = (subscription as any).pix_copia_e_cola ? 'pix' : 'cartao';
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'subscription', subscription_id: subscription.id, payment_method: method, return_url: window.location.origin + '/assinaturas' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentResult({ method, url: data?.payment_url || data?.checkout_url, pixCopiaECola: data?.pix_copia_e_cola, mode: data?.mode });
      setIsExpired(false);
      toast({ title: 'Novo link gerado', description: 'Um novo link de pagamento foi gerado automaticamente.' });
      onSuccess();
    } catch (err: any) {
      console.error('Error reissuing payment:', err);
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Erro ao reemitir pagamento.' });
    } finally {
      setReissuing(false);
    }
  };

  useEffect(() => {
    if (subscription && open) {
      setStatus(subscription.status);
      setPaymentResult(null);
      setIsExpired(false);
      setJustification('');
      setShowJustification(false);
      fetchItems();
      if ((subscription as any).payment_url && subscription.status !== 'ativa') {
        setPaymentResult({
          method: (subscription as any).pix_copia_e_cola ? 'pix' : 'cartao',
          url: (subscription as any).payment_url,
          pixCopiaECola: (subscription as any).pix_copia_e_cola,
        });
      }
      if (subscription.status !== 'ativa' && ((subscription as any).pix_transaction_id || (subscription as any).stripe_subscription_id)) {
        checkPixPaymentStatus();
      }
    }
  }, [subscription, open]);

  useEffect(() => {
    if (!open || !subscription || status === 'ativa') return;
    if (!(subscription as any).pix_transaction_id && !(subscription as any).stripe_subscription_id) return;
    const interval = setInterval(checkPixPaymentStatus, 15000);
    return () => clearInterval(interval);
  }, [open, subscription, status, checkPixPaymentStatus]);

  // Show justification field when status changes manually
  useEffect(() => {
    if (subscription && status !== subscription.status) {
      setShowJustification(true);
    } else {
      setShowJustification(false);
      setJustification('');
    }
  }, [status, subscription]);

  const fetchItems = async () => {
    if (!subscription) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('subscription_items').select('*, product:products(*)').eq('subscription_id', subscription.id);
      if (error) throw error;
      setItems(data as SubscriptionItem[]);
    } catch (error) {
      console.error('Error fetching subscription items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!subscription) return;

    // Require justification for manual status changes
    if (status !== subscription.status && !justification.trim()) {
      toast({ variant: 'destructive', title: 'Justificativa obrigatória', description: 'Informe o motivo da alteração de status.' });
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.from('subscriptions').update({ status }).eq('id', subscription.id);
      if (error) throw error;

      // Log manual status change with justification
      if (status !== subscription.status) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('system_settings').upsert({
          key: `sub_status_log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          value: {
            type: 'manual_status_change',
            subscription_id: subscription.id,
            subscription_number: subscription.subscription_number,
            previous_status: subscription.status,
            new_status: status,
            justification: justification.trim(),
            changed_by: user?.email || user?.id || 'unknown',
            timestamp: new Date().toISOString(),
          } as any,
          description: `Alteração manual de status: ${subscription.subscription_number}`,
        }, { onConflict: 'key' });
      }

      toast({ title: 'Status atualizado', description: 'O status da assinatura foi atualizado com sucesso.' });
      setJustification('');
      setShowJustification(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível atualizar o status.' });
    } finally {
      setUpdating(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getWeekdayLabel = (weekday: string) => {
    const labels: Record<string, string> = { domingo: 'Domingo', segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira', quinta: 'Quinta-feira', sexta: 'Sexta-feira', sabado: 'Sábado' };
    return labels[weekday] || weekday;
  };

  const getTimeSlotLabel = (slot: string) => {
    if (slot === 'manha') return '08:00–12:00';
    if (slot === 'tarde') return '12:00–16:00';
    return slot;
  };

  const handleGeneratePayment = async (method: 'cartao' | 'pix') => {
    if (!subscription) return;
    setGeneratingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'subscription', subscription_id: subscription.id, payment_method: method, return_url: window.location.origin + '/assinaturas' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentResult({ method, url: data?.payment_url || data?.checkout_url, pixCopiaECola: data?.pix_copia_e_cola, mode: data?.mode });
      toast({
        title: 'Pagamento gerado',
        description: method === 'cartao'
          ? 'Link de checkout criado.'
          : isEmergency
            ? 'Cobrança Pix criada.'
            : data?.mode === 'pix_automatico_jornada3'
              ? 'Pix Automático (Jornada 3) criado com sucesso!'
              : 'Cobrança Pix criada.',
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error generating payment:', error);
      toast({ variant: 'destructive', title: 'Erro ao gerar pagamento', description: error.message || 'Não foi possível gerar o pagamento.' });
    } finally {
      setGeneratingPayment(false);
    }
  };

  if (!subscription) return null;

  // Determine button labels based on emergency vs subscription
  const pixButtonLabel = isEmergency ? 'Pagamento Pix' : 'Assinatura Pix Automático';
  const cardButtonLabel = isEmergency ? 'Pagamento Cartão' : 'Assinatura Cartão';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEmergency ? '⚡ Pedido Emergencial' : 'Assinatura'} {subscription.subscription_number}
          </DialogTitle>
          <DialogDescription>
            {isEmergency ? 'Detalhes do pedido emergencial PJ' : 'Detalhes e gerenciamento da assinatura'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div><p className="text-sm text-muted-foreground">Cliente</p><p className="font-medium">{subscription.customer?.name || '—'}</p></div>
            <div><p className="text-sm text-muted-foreground">Telefone</p><p className="font-medium">{subscription.customer?.phone || '—'}</p></div>
            <div><p className="text-sm text-muted-foreground">Dia da Entrega</p><p className="font-medium">{getWeekdayLabel(subscription.delivery_weekday)}</p></div>
            <div><p className="text-sm text-muted-foreground">Horário</p><p className="font-medium">{getTimeSlotLabel(subscription.delivery_time_slot)}</p></div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            {status === 'ativa' ? (
              <div className="space-y-2">
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50">
                  <Badge variant="default">Ativa</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">(ativada via pagamento confirmado)</span>
                </div>
                <Select value={status} onValueChange={(v) => setStatus(v as SubscriptionStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="pausada">Pausada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50">
                  <Badge variant={status === 'pausada' ? 'secondary' : 'destructive'}>
                    {status === 'pausada' ? 'Pausada' : status === 'cancelada' ? 'Cancelada' : status}
                  </Badge>
                  {status === 'pausada' && (
                    <span className="ml-2 text-xs text-muted-foreground">Será ativada automaticamente após confirmação do pagamento</span>
                  )}
                </div>
                {status !== 'cancelada' && (
                  <Select value={status} onValueChange={(v) => { if (v === 'ativa') return; setStatus(v as SubscriptionStatus); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pausada">Pausada</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Justification field for manual status changes */}
            {showJustification && (
              <div className="space-y-2 p-3 border rounded-lg bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                <label className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  ⚠️ Justificativa obrigatória para alteração manual
                </label>
                <Textarea
                  placeholder="Informe o motivo da alteração de status..."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={2}
                  className="bg-background"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">{isEmergency ? 'Produtos do Pedido' : 'Produtos da Assinatura'}</h3>
            {loading ? (
              <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-center">Qtd</TableHead><TableHead className="text-center">Reservado</TableHead><TableHead className="text-right">Preço Unit.</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product?.name || '—'}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{item.reserved_stock}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.unit_price * item.quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-end pt-4 border-t">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{isEmergency ? 'Total do Pedido' : 'Valor Mensal'}</p>
                <p className="text-2xl font-bold">{formatCurrency(subscription.total_amount)}</p>
              </div>
            </div>
          </div>

          {subscription.notes && (
            <div className="p-4 bg-muted/50 rounded-lg"><p className="text-sm text-muted-foreground mb-1">Observações</p><p>{subscription.notes}</p></div>
          )}

          {/* Check Payment Button */}
          {status !== 'ativa' && paymentResult && !isExpired && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={checkPixPaymentStatus} disabled={checkingPayment}>
                {checkingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Verificar Pagamento
              </Button>
              <span className="text-xs text-muted-foreground">Verificação automática a cada 15s</span>
            </div>
          )}

          {/* Payment Section - buttons change based on emergency vs subscription */}
          {subscription.status !== 'ativa' && subscription.status !== 'cancelada' && !paymentResult && !isExpired && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <p className="text-sm font-medium">Gerar Pagamento</p>
              <p className="text-xs text-muted-foreground mb-2">
                {isEmergency
                  ? 'Gere o pagamento único para este pedido emergencial.'
                  : 'A assinatura será ativada automaticamente após confirmação do pagamento.'
                }
              </p>
              <div className="flex gap-3">
                <Button type="button" onClick={() => handleGeneratePayment('cartao')} disabled={generatingPayment} className="flex-1">
                  {generatingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  {cardButtonLabel}
                </Button>
                <Button type="button" variant="outline" onClick={() => handleGeneratePayment('pix')} disabled={generatingPayment} className="flex-1">
                  {generatingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                  {pixButtonLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Payment Result */}
          {paymentResult && (
            <PaymentResult
              paymentMethod={paymentResult.method}
              paymentUrl={paymentResult.url}
              pixCopiaECola={paymentResult.pixCopiaECola}
              isConfirmed={status === 'ativa'}
              isExpired={isExpired}
              mode={paymentResult.mode}
            />
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            <Button onClick={handleUpdateStatus} disabled={updating || (showJustification && !justification.trim())}>
              {updating ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Atualizando...</>) : 'Atualizar Status'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
