import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2, Info, AlertTriangle, Zap, CreditCard, Wallet, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
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

const subscriptionSchema = z.object({
  customer_id: z.string().min(1, 'Cliente é obrigatório'),
  delivery_weekday: z.enum(['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']),
  delivery_time_slot: z.string().min(1, 'Horário é obrigatório'),
  frequency: z.enum(['diaria', 'semanal', 'quinzenal', 'mensal']),
  payment_method: z.enum(['pix', 'cartao']),
  notes: z.string().optional(),
  is_emergency: z.boolean().optional(),
});

type SubscriptionFormData = z.infer<typeof subscriptionSchema>;

interface SubscriptionItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface SystemSettings {
  min_itens_assinatura_pf: number;
  min_itens_assinatura_pj: number;
  janelas_horario_entregas_assinaturas: string[];
  recorrencia_pj: string[];
  recorrencia_pf: string[];
  entregas_por_recorrencia: Record<string, number>;
  habilitar_emergencial_pj: boolean;
}

const frequencyLabels: Record<string, string> = {
  diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal',
};

const weekdayOptions = [
  { value: 'segunda', label: 'Segunda' }, { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' }, { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' }, { value: 'sabado', label: 'Sábado' },
  { value: 'domingo', label: 'Domingo' },
];

const DEFAULT_TIME_SLOTS = [
  '08:00–09:00', '09:00–10:00', '10:00–11:00', '11:00–12:00',
];

type DialogStep = 'form' | 'payment' | 'complete';

export function SubscriptionDialog({ open, onOpenChange, onSuccess }: SubscriptionDialogProps) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [customWeekdays, setCustomWeekdays] = useState<string[]>([]);
  const [useCustomWeekdays, setUseCustomWeekdays] = useState(false);
  const [step, setStep] = useState<DialogStep>('form');
  const [createdSubId, setCreatedSubId] = useState<string | null>(null);
  const [createdSubNumber, setCreatedSubNumber] = useState('');
  const [paymentResult, setPaymentResult] = useState<{ method: 'cartao' | 'pix'; url?: string; pixCopiaECola?: string; mode?: string } | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    min_itens_assinatura_pf: 1, min_itens_assinatura_pj: 1,
    janelas_horario_entregas_assinaturas: [],
    recorrencia_pj: ['diaria', 'semanal', 'quinzenal', 'mensal'],
    recorrencia_pf: ['semanal', 'quinzenal', 'mensal'],
    entregas_por_recorrencia: { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 },
    habilitar_emergencial_pj: false,
  });

  const form = useForm<SubscriptionFormData>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      customer_id: '', delivery_weekday: 'segunda', delivery_time_slot: '',
      frequency: 'semanal', payment_method: 'pix', notes: '', is_emergency: false,
    },
  });

  const selectedFrequency = form.watch('frequency');
  const isPJ = selectedCustomer?.customer_type === 'PJ';

  useEffect(() => {
    if (open) { fetchData(); resetState(); }
  }, [open]);

  const resetState = () => {
    setStep('form'); setCreatedSubId(null); setCreatedSubNumber('');
    setPaymentResult(null); setIsExpired(false); setPaymentConfirmed(false);
    setIsEmergency(false); setCustomWeekdays([]); setUseCustomWeekdays(false);
    setItems([]); setSelectedCustomer(null); form.reset();
  };

  useEffect(() => {
    if (isPJ && selectedFrequency === 'diaria') {
      setCustomWeekdays(['segunda', 'terca', 'quarta', 'quinta', 'sexta']);
      setUseCustomWeekdays(false);
    }
  }, [selectedFrequency, isPJ]);

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
          if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
          return val;
        };
        const oldMinItens = getValue('min_itens_assinatura', 1);
        setSettings({
          min_itens_assinatura_pf: getValue('min_itens_assinatura_pf', oldMinItens),
          min_itens_assinatura_pj: getValue('min_itens_assinatura_pj', oldMinItens),
          janelas_horario_entregas_assinaturas: getValue('janelas_horario_entregas_assinaturas', []),
          recorrencia_pj: getValue('recorrencia_pj', ['diaria', 'semanal', 'quinzenal', 'mensal']),
          recorrencia_pf: getValue('recorrencia_pf', ['semanal', 'quinzenal', 'mensal']),
          entregas_por_recorrencia: getValue('entregas_por_recorrencia', { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 }),
          habilitar_emergencial_pj: getValue('habilitar_emergencial_pj', false),
        });
      }
    } catch (error) { console.error('Error fetching data:', error); }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    setSelectedCustomer(customer || null);
    form.setValue('customer_id', customerId);
    setIsEmergency(false); setCustomWeekdays([]); setUseCustomWeekdays(false);
    if (customer) {
      const allowedFrequencies = customer.customer_type === 'PJ' ? settings.recorrencia_pj : settings.recorrencia_pf;
      const currentFrequency = form.getValues('frequency');
      if (!allowedFrequencies.includes(currentFrequency)) form.setValue('frequency', allowedFrequencies[0] as any);
      setItems((currentItems) => currentItems.map((item) => {
        const product = products.find((p) => p.id === item.product_id);
        if (product) return { ...item, unit_price: product.price_subscription };
        return item;
      }));
    }
  };

  const addItem = () => {
    if (products.length === 0) return;
    const availableProducts = products.filter(p => p.stock > 0);
    if (availableProducts.length === 0) {
      toast({ variant: 'destructive', title: 'Sem estoque', description: 'Nenhum produto com estoque disponível.' });
      return;
    }
    const firstProduct = availableProducts[0];
    setItems([...items, { product_id: firstProduct.id, quantity: 1, unit_price: firstProduct.price_subscription }]);
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof SubscriptionItem, value: string | number) => {
    setItems((currentItems) => currentItems.map((item, i) => {
      if (i !== index) return item;
      if (field === 'product_id') {
        const product = products.find((p) => p.id === value);
        if (product) return { ...item, product_id: value as string, unit_price: product.price_subscription };
      }
      return { ...item, [field]: value };
    }));
  };

  const getMinItems = () => !selectedCustomer ? settings.min_itens_assinatura_pf : selectedCustomer.customer_type === 'PJ' ? settings.min_itens_assinatura_pj : settings.min_itens_assinatura_pf;
  const calculatePerDeliveryTotal = () => items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  const getMonthlyDeliveries = () => {
    if (isEmergency) return 1;
    if (isPJ && useCustomWeekdays && customWeekdays.length > 0) return Math.round(customWeekdays.length * 4.33);
    return settings.entregas_por_recorrencia[selectedFrequency] || 1;
  };

  const calculateMonthlyTotal = () => calculatePerDeliveryTotal() * getMonthlyDeliveries();
  const hasMinItems = () => items.reduce((sum, item) => sum + item.quantity, 0) >= getMinItems();
  const getAllowedFrequencies = () => !selectedCustomer ? settings.recorrencia_pf : selectedCustomer.customer_type === 'PJ' ? settings.recorrencia_pj : settings.recorrencia_pf;
  const toggleCustomWeekday = (day: string) => setCustomWeekdays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const getTimeSlots = () => {
    if (settings.janelas_horario_entregas_assinaturas.length > 0) return settings.janelas_horario_entregas_assinaturas;
    return DEFAULT_TIME_SLOTS;
  };

  // Check payment
  const checkPaymentStatus = useCallback(async () => {
    if (!createdSubId || paymentConfirmed) return;
    setCheckingPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-pix-payment', {
        body: { type: 'subscription', subscription_id: createdSubId },
      });
      if (error) throw error;
      if (data?.status === 'confirmado' && data?.updated) {
        setPaymentConfirmed(true);
        setStep('complete');
        toast({ title: 'Pagamento confirmado!', description: isEmergency ? 'Pedido emergencial ativado.' : 'Assinatura ativada com sucesso.' });
        onSuccess();
      } else if (data?.status === 'expirado') {
        setIsExpired(true);
        handleReissuePayment();
      }
    } catch (err) { console.error('Error checking payment:', err); }
    finally { setCheckingPayment(false); }
  }, [createdSubId, paymentConfirmed]);

  useEffect(() => {
    if (step !== 'payment' || !createdSubId || paymentConfirmed) return;
    const interval = setInterval(checkPaymentStatus, 15000);
    return () => clearInterval(interval);
  }, [step, createdSubId, paymentConfirmed, checkPaymentStatus]);

  const handleReissuePayment = async () => {
    if (!createdSubId || reissuing) return;
    setReissuing(true);
    try {
      const method = form.getValues('payment_method') || 'pix';
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { type: 'subscription', subscription_id: createdSubId, payment_method: method, return_url: window.location.origin + '/assinaturas' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPaymentResult({ method: method as 'pix' | 'cartao', url: data?.payment_url || data?.checkout_url, pixCopiaECola: data?.pix_copia_e_cola, mode: data?.mode });
      setIsExpired(false);
      toast({ title: 'Novo link gerado', description: 'Um novo link de pagamento foi gerado.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message || 'Erro ao reemitir pagamento.' });
    } finally { setReissuing(false); }
  };

  const onSubmit = async (data: SubscriptionFormData) => {
    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Adicione pelo menos um item.' });
      return;
    }
    if (!hasMinItems()) {
      toast({ variant: 'destructive', title: 'Erro', description: `É necessário ter pelo menos ${getMinItems()} item(ns).` });
      return;
    }
    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (product && item.quantity > product.stock) {
        toast({ variant: 'destructive', title: 'Estoque insuficiente', description: `"${product.name}" tem apenas ${product.stock} unidades disponíveis.` });
        return;
      }
    }

    setLoading(true);
    try {
      const deliveryWeekdays = isPJ && selectedFrequency === 'diaria'
        ? ['segunda', 'terca', 'quarta', 'quinta', 'sexta']
        : isPJ && useCustomWeekdays ? customWeekdays : null;

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          customer_id: data.customer_id,
          delivery_weekday: data.delivery_weekday,
          delivery_time_slot: data.delivery_time_slot,
          frequency: isEmergency ? null : data.frequency,
          notes: data.notes || null,
          total_amount: isEmergency ? calculatePerDeliveryTotal() : calculateMonthlyTotal(),
          is_emergency: isEmergency,
          delivery_weekdays: deliveryWeekdays,
          status: 'pausada',
        })
        .select()
        .single();

      if (subError) throw subError;

      const subscriptionItems = items.map((item) => ({
        subscription_id: subscription.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        reserved_stock: item.quantity,
      }));

      const { error: itemsError } = await supabase.from('subscription_items').insert(subscriptionItems);
      if (itemsError) throw itemsError;

      setCreatedSubId(subscription.id);
      setCreatedSubNumber(subscription.subscription_number);

      // Generate payment immediately
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('create-payment', {
        body: { type: 'subscription', subscription_id: subscription.id, payment_method: data.payment_method, return_url: window.location.origin + '/assinaturas' },
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

      toast({
        title: isEmergency ? 'Pedido emergencial criado' : 'Assinatura criada',
        description: `${subscription.subscription_number} — Aguardando pagamento.`,
      });
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível criar.' });
    } finally { setLoading(false); }
  };

  const handleClose = () => { onOpenChange(false); resetState(); };

  const weekdays = [
    { value: 'domingo', label: 'Domingo' }, { value: 'segunda', label: 'Segunda-feira' },
    { value: 'terca', label: 'Terça-feira' }, { value: 'quarta', label: 'Quarta-feira' },
    { value: 'quinta', label: 'Quinta-feira' }, { value: 'sexta', label: 'Sexta-feira' },
    { value: 'sabado', label: 'Sábado' },
  ];

  const allowedFrequencies = getAllowedFrequencies();

  // Button labels based on emergency vs subscription
  const pixLabel = isEmergency ? 'Pagamento Pix' : 'Assinatura Pix Automático';
  const cardLabel = isEmergency ? 'Pagamento Cartão' : 'Assinatura Cartão';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'form' && (isEmergency ? '⚡ Pedido Emergencial PJ' : 'Nova Assinatura')}
            {step === 'payment' && `${isEmergency ? 'Pedido' : 'Assinatura'} ${createdSubNumber} — Aguardando Pagamento`}
            {step === 'complete' && `${isEmergency ? 'Pedido' : 'Assinatura'} ${createdSubNumber} — Finalizado ✅`}
          </DialogTitle>
          <DialogDescription>
            {step === 'form' && (isEmergency ? 'Pedido emergencial não recorrente para cliente PJ.' : 'Preencha os dados, selecione o pagamento e finalize.')}
            {step === 'payment' && 'Envie os dados de pagamento ao cliente. O sistema monitora automaticamente.'}
            {step === 'complete' && (isEmergency ? 'Pedido emergencial finalizado.' : 'Assinatura ativada com sucesso.')}
          </DialogDescription>
        </DialogHeader>

        {/* ===== STEP 1: FORM ===== */}
        {step === 'form' && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={handleCustomerChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} ({customer.customer_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedCustomer && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Cliente {selectedCustomer.customer_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'} — 
                    Mínimo: {getMinItems()} item(ns) | 
                    Frequências: {allowedFrequencies.map(f => frequencyLabels[f]).join(', ')}
                  </AlertDescription>
                </Alert>
              )}

              {isPJ && settings.habilitar_emergencial_pj && !isEmergency && (
                <Button type="button" variant="outline" className="w-full border-dashed border-2 gap-2" onClick={() => setIsEmergency(true)}>
                  <Zap className="h-4 w-4" />Fazer Pedido Emergencial (não recorrente)
                </Button>
              )}

              {isEmergency && (
                <Alert className="border-accent bg-accent/10">
                  <Zap className="h-4 w-4 text-accent-foreground" />
                  <AlertTitle className="text-accent-foreground">Pedido Emergencial</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    Este pedido não gera recorrência. Mínimo de {getMinItems()} item(ns).
                    <Button type="button" variant="link" size="sm" className="ml-2" onClick={() => setIsEmergency(false)}>Cancelar emergencial</Button>
                  </AlertDescription>
                </Alert>
              )}

              {!isEmergency && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="frequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recorrência</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {allowedFrequencies.map((freq) => (
                            <SelectItem key={freq} value={freq}>{frequencyLabels[freq]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">{getMonthlyDeliveries()} entrega(s)/mês</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="delivery_weekday" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia Principal da Entrega</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {weekdays.map((day) => (<SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="delivery_time_slot" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Janela de Horário</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {getTimeSlots().map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {isEmergency && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="delivery_weekday" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia da Entrega</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {weekdays.map((day) => (<SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="delivery_time_slot" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Janela de Horário</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {getTimeSlots().map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}

              {isPJ && selectedFrequency === 'diaria' && !isEmergency && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Recorrência diária: entregas automáticas de <strong>Segunda a Sexta-feira</strong>.
                    <div className="flex flex-wrap gap-1 mt-2">
                      {['segunda', 'terca', 'quarta', 'quinta', 'sexta'].map(d => (
                        <Badge key={d} variant="secondary">{weekdayOptions.find(w => w.value === d)?.label}</Badge>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {isPJ && selectedFrequency === 'semanal' && !isEmergency && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Checkbox id="custom-weekdays" checked={useCustomWeekdays} onCheckedChange={(checked) => { setUseCustomWeekdays(!!checked); if (!checked) setCustomWeekdays([]); }} />
                    <label htmlFor="custom-weekdays" className="text-sm font-medium">Personalizar dias da semana</label>
                  </div>
                  {useCustomWeekdays && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Selecione os dias de entrega:</p>
                      <div className="flex flex-wrap gap-2">
                        {weekdayOptions.map((day) => (
                          <div key={day.value} className="flex items-center gap-1.5">
                            <Checkbox checked={customWeekdays.includes(day.value)} onCheckedChange={() => toggleCustomWeekday(day.value)} />
                            <span className="text-sm">{day.label}</span>
                          </div>
                        ))}
                      </div>
                      {customWeekdays.length > 0 && (
                        <p className="text-xs text-muted-foreground">≈ {Math.round(customWeekdays.length * 4.33)} entregas/mês</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {items.length > 0 && !hasMinItems() && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Itens insuficientes</AlertTitle>
                  <AlertDescription>É necessário ter pelo menos {getMinItems()} item(ns) {isPJ ? '(PJ)' : '(PF)'}.</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>Produtos {isEmergency ? 'do Pedido' : 'da Assinatura'}</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-1" />Adicionar Produto
                  </Button>
                </div>

                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    Nenhum produto adicionado. Clique em "Adicionar Produto" para começar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item, index) => {
                      const product = products.find(p => p.id === item.product_id);
                      return (
                        <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                          <Select value={item.product_id} onValueChange={(value) => updateItem(index, 'product_id', value)}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                            <SelectContent>
                              {products.filter(p => p.stock > 0).map((product) => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} - {formatCurrency(product.price_subscription)}/un (estoque: {product.stock})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" min="1" max={product?.stock || 999} value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-20" />
                          <div className="w-28 text-right font-medium">{formatCurrency(item.unit_price * item.quantity)}</div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {items.length > 0 && (
                  <div className="flex justify-end pt-4 border-t">
                    <div className="text-right space-y-1">
                      <p className="text-sm text-muted-foreground">Valor por entrega: {formatCurrency(calculatePerDeliveryTotal())}</p>
                      {!isEmergency && (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Entregas por mês: {getMonthlyDeliveries()}x ({isPJ && useCustomWeekdays && customWeekdays.length > 0 ? 'Personalizado' : frequencyLabels[selectedFrequency]})
                          </p>
                          <p className="text-lg font-bold text-primary">Valor Mensal: {formatCurrency(calculateMonthlyTotal())}</p>
                        </>
                      )}
                      {isEmergency && <p className="text-lg font-bold text-primary">Total: {formatCurrency(calculatePerDeliveryTotal())}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method Selection */}
              <FormField control={form.control} name="payment_method" render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma de Pagamento</FormLabel>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant={field.value === 'pix' ? 'default' : 'outline'}
                      className="h-12 gap-2"
                      onClick={() => field.onChange('pix')}
                    >
                      <Wallet className="h-4 w-4" />{pixLabel}
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'cartao' ? 'default' : 'outline'}
                      className="h-12 gap-2"
                      onClick={() => field.onChange('cartao')}
                    >
                      <CreditCard className="h-4 w-4" />{cardLabel}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl><Textarea placeholder="Observações..." rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" disabled={loading || !hasMinItems()}>
                  {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finalizando...</>) : isEmergency ? (<><Zap className="mr-2 h-4 w-4" />Finalizar Pedido Emergencial</>) : 'Finalizar Assinatura'}
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
                  <p className="text-sm text-muted-foreground">{isEmergency ? 'Pedido Emergencial' : 'Assinatura'}</p>
                  <p className="font-mono font-bold">{createdSubNumber}</p>
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

        {/* ===== STEP 3: COMPLETE ===== */}
        {step === 'complete' && (
          <div className="space-y-6">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
              <Check className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-green-700 dark:text-green-400">
                {isEmergency ? 'Pedido Emergencial Finalizado!' : 'Assinatura Ativada!'}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                <strong>{createdSubNumber}</strong> — Pagamento confirmado{!isEmergency && ', entregas registradas na dashboard'}.
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
