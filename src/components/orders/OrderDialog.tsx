import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2, Info, AlertTriangle, CreditCard, Wallet, RefreshCw, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PaymentResult } from '@/components/payments/PaymentResult';
import { supabase } from '@/integrations/supabase/client';
import { Customer, Product } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

const orderSchema = z.object({
  customer_id: z.string().min(1, 'Cliente é obrigatório'),
  payment_method: z.enum(['pix', 'cartao']),
  notes: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface SystemSettings {
  min_qtd_kit_preco: number;
  hora_limite_entrega_dia: string;
  janelas_horario_entregas_avulsas: string[];
}

const DEFAULT_TIME_SLOTS = [
  '08:00–09:00', '09:00–10:00', '10:00–11:00', '11:00–12:00',
];

function checkStockAvailability(items: OrderItem[], products: Product[]): string | null {
  for (const item of items) {
    const product = products.find(p => p.id === item.product_id);
    if (!product) continue;
    if (item.quantity > product.stock) {
      return `Estoque insuficiente para "${product.name}": disponível ${product.stock}, solicitado ${item.quantity}.`;
    }
  }
  return null;
}

type DialogStep = 'form' | 'payment' | 'delivery_slot' | 'complete';

export function OrderDialog({ open, onOpenChange, onSuccess }: OrderDialogProps) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<DialogStep>('form');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string>('');
  const [generatingPayment, setGeneratingPayment] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ method: 'cartao' | 'pix'; url?: string; pixCopiaECola?: string; mode?: string } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [selectedDeliverySlot, setSelectedDeliverySlot] = useState('');
  const [updatingSlot, setUpdatingSlot] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    min_qtd_kit_preco: 3,
    hora_limite_entrega_dia: '12:00',
    janelas_horario_entregas_avulsas: [],
  });

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      customer_id: '',
      payment_method: 'pix',
      notes: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchData();
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setStep('form');
    setCreatedOrderId(null);
    setCreatedOrderNumber('');
    setPaymentResult(null);
    setIsExpired(false);
    setPaymentConfirmed(false);
    setSelectedDeliverySlot('');
    setOrderItems([]);
    setSelectedCustomer(null);
    form.reset();
  };

  const fetchData = async () => {
    try {
      const [customersRes, productsRes, settingsRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('products').select('*').eq('active', true).order('name'),
        supabase.from('system_settings').select('*'),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (productsRes.error) throw productsRes.error;

      setCustomers(customersRes.data as Customer[]);
      setProducts(productsRes.data as Product[]);
      
      if (settingsRes.data) {
        const settingsMap = new Map(settingsRes.data.map(s => [s.key, s.value]));
        const getValue = (key: string, defaultValue: any) => {
          const val = settingsMap.get(key);
          if (val === undefined || val === null) return defaultValue;
          if (typeof val === 'string') {
            try { return JSON.parse(val); } catch { return val; }
          }
          return val;
        };

        setSettings({
          min_qtd_kit_preco: getValue('min_qtd_kit_preco', 3),
          hora_limite_entrega_dia: getValue('hora_limite_entrega_dia', '12:00'),
          janelas_horario_entregas_avulsas: getValue('janelas_horario_entregas_avulsas', []),
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const getTotalQuantity = () => orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const shouldUseKitPrice = () => getTotalQuantity() >= settings.min_qtd_kit_preco;

  useEffect(() => {
    if (products.length === 0) return;
    const useKitPrice = shouldUseKitPrice();
    setOrderItems((items) =>
      items.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (product) {
          const price = useKitPrice ? product.price_kit : product.price_single;
          return { ...item, unit_price: price || product.price_single };
        }
        return item;
      })
    );
  }, [orderItems.map(i => i.quantity).join(','), products, settings.min_qtd_kit_preco]);

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setSelectedCustomer(customer || null);
    form.setValue('customer_id', customerId);
  };

  const addItem = () => {
    if (products.length === 0) return;
    const firstProduct = products[0];
    const useKitPrice = getTotalQuantity() + 1 >= settings.min_qtd_kit_preco;
    const price = useKitPrice ? firstProduct.price_kit : firstProduct.price_single;
    setOrderItems([
      ...orderItems,
      { product_id: firstProduct.id, quantity: 1, unit_price: price || firstProduct.price_single },
    ]);
  };

  const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    setOrderItems((items) =>
      items.map((item, i) => {
        if (i !== index) return item;
        if (field === 'product_id') {
          const product = products.find((p) => p.id === value);
          if (product) {
            const useKitPrice = shouldUseKitPrice();
            const price = useKitPrice ? product.price_kit : product.price_single;
            return { ...item, product_id: value as string, unit_price: price || product.price_single };
          }
        }
        return { ...item, [field]: value };
      })
    );
  };

  const calculateTotal = () => orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const isPJCustomer = selectedCustomer?.customer_type === 'PJ';
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const useKitPrice = shouldUseKitPrice();
  const eligibleCustomers = customers.filter(c => c.customer_type === 'PF');

  const getTimeSlots = () => {
    if (settings.janelas_horario_entregas_avulsas.length > 0) return settings.janelas_horario_entregas_avulsas;
    return DEFAULT_TIME_SLOTS;
  };

  // Check payment status
  const checkPaymentStatus = useCallback(async () => {
    if (!createdOrderId || paymentConfirmed) return;
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-pix-payment', {
        body: { type: 'order', order_id: createdOrderId },
      });
      if (error) throw error;
      if (data?.status === 'confirmado' && data?.updated) {
        setPaymentConfirmed(true);
        setStep('delivery_slot');
        toast({ title: 'Pagamento confirmado!', description: 'Selecione a janela de entrega.' });
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
  }, [createdOrderId, paymentConfirmed]);

  // Auto-check interval
  useEffect(() => {
    if (step !== 'payment' || !createdOrderId || paymentConfirmed) return;
    const interval = setInterval(checkPaymentStatus, 15000);
    return () => clearInterval(interval);
  }, [step, createdOrderId, paymentConfirmed, checkPaymentStatus]);

  const handleReissuePayment = async () => {
    if (!createdOrderId || reissuing) return;
    setReissuing(true);
    try {
      const method = form.getValues('payment_method') || 'pix';
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'order', order_id: createdOrderId, payment_method: method, return_url: window.location.origin + '/pedidos' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentResult({ method: method as 'pix' | 'cartao', url: data?.payment_url || data?.checkout_url, pixCopiaECola: data?.pix_copia_e_cola, mode: data?.mode });
      setIsExpired(false);
      toast({ title: 'Novo link gerado', description: 'Um novo link de pagamento foi gerado.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Erro ao reemitir pagamento.' });
    } finally {
      setReissuing(false);
    }
  };

  const onSubmit = async (data: OrderFormData) => {
    if (isPJCustomer) {
      toast({ variant: 'destructive', title: 'Cliente PJ', description: 'Clientes PJ só podem contratar assinaturas.' });
      return;
    }
    if (orderItems.length === 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Adicione pelo menos um item ao pedido.' });
      return;
    }
    const stockError = checkStockAvailability(orderItems, products);
    if (stockError) {
      toast({ variant: 'destructive', title: 'Estoque insuficiente', description: stockError });
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: data.customer_id,
          payment_method: data.payment_method as any,
          notes: data.notes || null,
          total_amount: calculateTotal(),
        } as any)
        .select()
        .single();

      if (orderError) throw orderError;

      const items = orderItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.unit_price * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(items);
      if (itemsError) throw itemsError;

      setCreatedOrderId(order.id);
      setCreatedOrderNumber(order.order_number);

      // Step 2: Generate payment immediately
      setGeneratingPayment(true);
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('create-payment', {
        body: { type: 'order', order_id: order.id, payment_method: data.payment_method, return_url: window.location.origin + '/pedidos' },
      });

      if (paymentError) throw paymentError;
      if (paymentData?.error) throw new Error(paymentData.error);

      setPaymentResult({
        method: data.payment_method as 'pix' | 'cartao',
        url: paymentData?.payment_url || paymentData?.checkout_url,
        pixCopiaECola: paymentData?.pix_copia_e_cola,
        mode: paymentData?.mode,
      });

      setStep('payment');
      onSuccess();

      toast({ title: 'Pedido criado', description: `Pedido ${order.order_number} criado. Aguardando pagamento.` });
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível criar o pedido.' });
    } finally {
      setLoading(false);
      setGeneratingPayment(false);
    }
  };

  const calculateDeliveryDate = (): string => {
    const now = new Date();
    const [limitH, limitM] = (settings.hora_limite_entrega_dia || '12:00').split(':').map(Number);
    const limitMinutes = limitH * 60 + (limitM || 0);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let deliveryDate = new Date(now);
    if (currentMinutes > limitMinutes) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);
    }

    // Skip weekends and holidays (simplified: skip Sat/Sun)
    while (deliveryDate.getDay() === 0 || deliveryDate.getDay() === 6) {
      deliveryDate.setDate(deliveryDate.getDate() + 1);
    }

    return deliveryDate.toISOString().split('T')[0];
  };

  const handleConfirmDeliverySlot = async () => {
    if (!createdOrderId || !selectedDeliverySlot) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma janela de entrega.' });
      return;
    }
    setUpdatingSlot(true);
    try {
      const deliveryDate = calculateDeliveryDate();
      const { error } = await supabase.from('orders').update({
        delivery_time_slot: selectedDeliverySlot,
        delivery_date: deliveryDate,
      }).eq('id', createdOrderId);
      if (error) throw error;

      setStep('complete');
      onSuccess();
      toast({ title: 'Entrega agendada', description: `Janela ${selectedDeliverySlot} para ${new Date(deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR')}.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setUpdatingSlot(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'form' && 'Novo Pedido Avulso'}
            {step === 'payment' && `Pedido ${createdOrderNumber} — Aguardando Pagamento`}
            {step === 'delivery_slot' && `Pedido ${createdOrderNumber} — Agendar Entrega`}
            {step === 'complete' && `Pedido ${createdOrderNumber} — Finalizado ✅`}
          </DialogTitle>
          <DialogDescription>
            {step === 'form' && 'Preencha os dados, selecione o pagamento e finalize.'}
            {step === 'payment' && 'Envie os dados de pagamento ao cliente. O sistema monitora automaticamente.'}
            {step === 'delivery_slot' && 'Pagamento confirmado! Selecione a janela de entrega.'}
            {step === 'complete' && 'Pedido finalizado com sucesso.'}
          </DialogDescription>
        </DialogHeader>

        {/* ===== STEP 1: FORM ===== */}
        {step === 'form' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {isPJCustomer && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Cliente PJ não permitido</AlertTitle>
                  <AlertDescription>
                    Clientes PJ só podem contratar assinaturas. Selecione um cliente PF.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente (apenas PF)</FormLabel>
                      <Select onValueChange={handleCustomerChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecione um cliente PF" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {eligibleCustomers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name} (PF)
                            </SelectItem>
                          ))}
                          {customers.filter(c => c.customer_type === 'PJ').map((customer) => (
                            <SelectItem key={customer.id} value={customer.id} disabled>
                              {customer.name} (PJ - somente assinaturas)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de Pagamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pix">Pagamento Pix</SelectItem>
                          <SelectItem value="cartao">Pagamento Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {useKitPrice ? (
                    <span className="text-primary font-medium">✓ Preço de kit aplicado! ({getTotalQuantity()} itens - mínimo: {settings.min_qtd_kit_preco})</span>
                  ) : (
                    <span>Adicione {settings.min_qtd_kit_preco - getTotalQuantity()} item(ns) para aplicar o preço de kit.</span>
                  )}
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>Itens do Pedido</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={isPJCustomer}>
                    <Plus className="h-4 w-4 mr-1" />Adicionar Item
                  </Button>
                </div>

                {orderItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Select value={item.product_id} onValueChange={(value) => updateItem(index, 'product_id', value)}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20" />
                        <div className="w-28 text-right font-medium">{formatCurrency(item.unit_price * item.quantity)}</div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {orderItems.length > 0 && (
                  <div className="flex justify-end pt-4 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total do Pedido</p>
                      <p className="text-2xl font-bold">{formatCurrency(calculateTotal())}</p>
                    </div>
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Observações sobre o pedido..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" disabled={loading || isPJCustomer || orderItems.length === 0}>
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finalizando...</>) : 'Finalizar Pedido'}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {/* ===== STEP 2: PAYMENT ===== */}
        {step === 'payment' && (
          <div className="space-y-6">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Pedido</p>
                  <p className="font-mono font-bold">{createdOrderNumber}</p>
                </div>
                <Badge variant="secondary">Aguardando Pagamento</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Empresa recebedora: <strong>JR HIDROPONICOS LTDA</strong>
              </p>
            </div>

            {paymentResult && (
              <PaymentResult
                paymentMethod={paymentResult.method}
                paymentUrl={paymentResult.url}
                pixCopiaECola={paymentResult.pixCopiaECola}
                isConfirmed={paymentConfirmed}
                isExpired={isExpired}
                mode={paymentResult.mode}
              />
            )}

            {!paymentConfirmed && paymentResult && !isExpired && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={checkPaymentStatus} disabled={checkingPayment}>
                  {checkingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Verificar Pagamento
                </Button>
                <span className="text-xs text-muted-foreground">Verificação automática a cada 15s</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        )}

        {/* ===== STEP 3: DELIVERY SLOT ===== */}
        {step === 'delivery_slot' && (
          <div className="space-y-6">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Check className="h-5 w-5 text-green-600" />
                <p className="font-medium text-green-700 dark:text-green-400">Pagamento Confirmado!</p>
              </div>
              <p className="text-sm text-muted-foreground">Agora selecione a janela de horário para entrega.</p>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Pedidos com pagamento confirmado após as <strong>{settings.hora_limite_entrega_dia}</strong> serão agendados para o próximo dia útil.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm font-medium">Data de entrega calculada: <strong>{new Date(calculateDeliveryDate() + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Janela de Entrega</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {getTimeSlots().map((slot) => (
                  <Button
                    key={slot}
                    type="button"
                    variant={selectedDeliverySlot === slot ? 'default' : 'outline'}
                    className="h-12"
                    onClick={() => setSelectedDeliverySlot(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={handleClose}>Fechar</Button>
              <Button onClick={handleConfirmDeliverySlot} disabled={updatingSlot || !selectedDeliverySlot}>
                {updatingSlot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar Entrega
              </Button>
            </div>
          </div>
        )}

        {/* ===== STEP 4: COMPLETE ===== */}
        {step === 'complete' && (
          <div className="space-y-6">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
              <Check className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-green-700 dark:text-green-400">Pedido Finalizado!</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Pedido <strong>{createdOrderNumber}</strong> — Pagamento confirmado, entrega agendada para <strong>{selectedDeliverySlot}</strong> em <strong>{calculateDeliveryDate()}</strong>.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
