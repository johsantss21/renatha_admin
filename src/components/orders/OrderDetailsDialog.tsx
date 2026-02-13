import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, XCircle, CreditCard, Wallet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PaymentResult } from '@/components/payments/PaymentResult';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderItem, DeliveryStatus } from '@/types/database';
import type { PaymentStatus } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { CancelOrderDialog } from './CancelOrderDialog';

interface OrderDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onSuccess: () => void;
}

export function OrderDetailsDialog({ open, onOpenChange, order, onSuccess }: OrderDetailsDialogProps) {
  const { toast } = useToast();
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pendente');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('aguardando');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ method: 'cartao' | 'pix'; url?: string; pixCopiaECola?: string; mode?: string } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [reissuing, setReissuing] = useState(false);

  const checkPixPaymentStatus = useCallback(async () => {
    if (!order || paymentStatus !== 'pendente') return;
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-pix-payment', {
        body: { type: 'order', order_id: order.id },
      });
      if (error) throw error;
      if (data?.status === 'confirmado' && data?.updated) {
        setPaymentStatus('confirmado');
        setPaymentResult(prev => prev ? { ...prev } : null);
        toast({ title: 'Pagamento confirmado!', description: 'O pagamento foi detectado e o pedido atualizado.' });
        onSuccess();
      } else if (data?.status === 'expirado') {
        setIsExpired(true);
        // Auto-reissue
        handleReissuePayment();
      }
    } catch (err) {
      console.error('Error checking payment:', err);
    } finally {
      setCheckingPayment(false);
    }
  }, [order, paymentStatus]);

  const handleReissuePayment = async () => {
    if (!order || reissuing) return;
    setReissuing(true);
    try {
      const method = order.payment_method === 'cartao' ? 'cartao' : 'pix';
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'order', order_id: order.id, payment_method: method, return_url: window.location.origin + '/pedidos' },
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
    if (order && open) {
      setPaymentStatus(order.payment_status);
      setDeliveryStatus(order.delivery_status);
      setPaymentResult(null);
      setIsExpired(false);
      fetchOrderItems();
      if ((order as any).payment_url && order.payment_status === 'pendente') {
        setPaymentResult({
          method: (order.payment_method === 'pix' ? 'pix' : 'cartao'),
          url: (order as any).payment_url,
          pixCopiaECola: (order as any).pix_copia_e_cola,
        });
      }
      if (order.payment_status === 'pendente' && (order.pix_transaction_id || order.stripe_payment_intent_id)) {
        checkPixPaymentStatus();
      }
    }
  }, [order, open]);

  useEffect(() => {
    if (!open || !order || paymentStatus !== 'pendente') return;
    if (!order.pix_transaction_id && !order.stripe_payment_intent_id) return;
    const interval = setInterval(checkPixPaymentStatus, 15000);
    return () => clearInterval(interval);
  }, [open, order, paymentStatus, checkPixPaymentStatus]);

  const fetchOrderItems = async () => {
    if (!order) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('order_items').select('*, product:products(*)').eq('order_id', order.id);
      if (error) throw error;
      setOrderItems(data as OrderItem[]);
    } catch (error) {
      console.error('Error fetching order items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!order) return;
    setUpdating(true);
    try {
      const { error } = await supabase.from('orders').update({ delivery_status: deliveryStatus }).eq('id', order.id);
      if (error) throw error;
      toast({ title: 'Status atualizado', description: 'O status do pedido foi atualizado com sucesso.' });
      onSuccess();
    } catch (error) {
      console.error('Error updating order:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível atualizar o status.' });
    } finally {
      setUpdating(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getPaymentMethodLabel = (method: string | null) => {
    const labels: Record<string, string> = { pix: 'PIX', cartao: 'Cartão', boleto: 'Boleto', stripe: 'Stripe' };
    return method ? labels[method] || method : '—';
  };

  const getTimeSlotLabel = (slot: string | null) => {
    if (!slot) return '—';
    if (slot === 'manha') return '08:00–12:00';
    if (slot === 'tarde') return '12:00–16:00';
    return slot;
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      pendente: { variant: 'secondary', label: 'Pendente' },
      confirmado: { variant: 'default', label: 'Confirmado' },
      recusado: { variant: 'destructive', label: 'Recusado' },
      cancelado: { variant: 'destructive', label: 'Cancelado' },
    };
    return variants[status] || { variant: 'secondary' as const, label: status };
  };

  const isCancelled = order?.payment_status === 'cancelado' || order?.delivery_status === 'cancelado';

  const handleGeneratePayment = async (method: 'cartao' | 'pix') => {
    if (!order) return;
    setGeneratingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'order', order_id: order.id, payment_method: method, return_url: window.location.origin + '/pedidos' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentResult({ method, url: data?.payment_url || data?.checkout_url, pixCopiaECola: data?.pix_copia_e_cola, mode: data?.mode });
      toast({ title: 'Pagamento gerado', description: method === 'cartao' ? 'Link de checkout criado.' : 'Cobrança Pix criada.' });
      onSuccess();
    } catch (error: any) {
      console.error('Error generating payment:', error);
      toast({ variant: 'destructive', title: 'Erro ao gerar pagamento', description: error.message || 'Não foi possível gerar o pagamento.' });
    } finally {
      setGeneratingPayment(false);
    }
  };

  if (!order) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Pedido {order.order_number}
              {isCancelled && <Badge variant="destructive">Cancelado</Badge>}
            </DialogTitle>
            <DialogDescription>Detalhes e gerenciamento do pedido</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {isCancelled && order.cancelled_at && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium mb-1">Pedido Cancelado</p>
                <p className="text-sm text-muted-foreground">
                  Cancelado em {format(new Date(order.cancelled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {order.cancellation_reason && (
                  <p className="text-sm mt-2"><span className="font-medium">Motivo:</span> {order.cancellation_reason}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div><p className="text-sm text-muted-foreground">Cliente</p><p className="font-medium">{order.customer?.name || '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Telefone</p><p className="font-medium">{order.customer?.phone || '—'}</p></div>
              <div><p className="text-sm text-muted-foreground">Forma de Pagamento</p><p className="font-medium">{getPaymentMethodLabel(order.payment_method)}</p></div>
              <div><p className="text-sm text-muted-foreground">Data do Pedido</p><p className="font-medium">{format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div><p className="text-sm text-muted-foreground">Data de Entrega</p><p className="font-medium">{order.delivery_date ? format(new Date(order.delivery_date), 'dd/MM/yyyy', { locale: ptBR }) : 'A definir (calculada após confirmação do pagamento)'}</p></div>
              <div><p className="text-sm text-muted-foreground">Horário</p><p className="font-medium">{getTimeSlotLabel(order.delivery_time_slot)}</p></div>
            </div>

            {!isCancelled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status do Pagamento</label>
                  <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50">
                    <Badge variant={getPaymentStatusBadge(paymentStatus).variant}>{getPaymentStatusBadge(paymentStatus).label}</Badge>
                    <span className="ml-2 text-xs text-muted-foreground">(controlado por integração)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status da Entrega</label>
                  <Select value={deliveryStatus} onValueChange={(v) => setDeliveryStatus(v as DeliveryStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aguardando">Aguardando</SelectItem>
                      <SelectItem value="em_rota">Em Rota</SelectItem>
                      <SelectItem value="entregue">Entregue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="font-medium">Itens do Pedido</h3>
              {loading ? (
                <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-center">Qtd</TableHead><TableHead className="text-right">Preço Unit.</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {orderItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.product?.name || '—'}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div className="flex justify-end pt-4 border-t">
                <div className="text-right"><p className="text-sm text-muted-foreground">Total do Pedido</p><p className="text-2xl font-bold">{formatCurrency(order.total_amount)}</p></div>
              </div>
            </div>

            {order.notes && (
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-sm text-muted-foreground mb-1">Observações</p><p>{order.notes}</p></div>
            )}

            {/* Check Payment Button */}
            {!isCancelled && paymentStatus === 'pendente' && paymentResult && !isExpired && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={checkPixPaymentStatus} disabled={checkingPayment}>
                  {checkingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Verificar Pagamento
                </Button>
                <span className="text-xs text-muted-foreground">Verificação automática a cada 15s</span>
              </div>
            )}

            {/* Payment Section */}
            {!isCancelled && order.payment_status === 'pendente' && !paymentResult && !isExpired && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <p className="text-sm font-medium">Gerar Pagamento</p>
                <div className="flex gap-3">
                  <Button type="button" onClick={() => handleGeneratePayment('cartao')} disabled={generatingPayment} className="flex-1">
                    {generatingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Pagamento Cartão
                  </Button>
                  <Button type="button" variant="outline" onClick={() => handleGeneratePayment('pix')} disabled={generatingPayment} className="flex-1">
                    {generatingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                    Pagamento Pix
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
                isConfirmed={paymentStatus === 'confirmado'}
                isExpired={isExpired}
                mode={paymentResult.mode}
              />
            )}

            <div className="flex justify-between gap-3">
              {!isCancelled && (
                <Button type="button" variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                  <XCircle className="h-4 w-4 mr-2" />Cancelar Pedido
                </Button>
              )}
              <div className="flex gap-3 ml-auto">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                {!isCancelled && (
                  <Button onClick={handleUpdateStatus} disabled={updating}>
                    {updating ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Atualizando...</>) : 'Atualizar Status'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CancelOrderDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen} order={order} onSuccess={() => { setCancelDialogOpen(false); onSuccess(); }} />
    </>
  );
}
