import { useEffect, useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DeliveryFilters } from './DeliveryFilters';
import { DeliveryCard, DeliveryItem } from './DeliveryCard';
import { RescheduleDialog } from './RescheduleDialog';
import { DeliveryStatus } from '@/types/database';

interface SystemSettings {
  diasFuncionamento: string[];
  feriados: string[];
  janelasAvulsas: string[];
  janelasAssinaturas: string[];
}

function buildAddress(c: any): string {
  const parts = [c.street, c.number, c.complement, c.neighborhood, c.city, c.state].filter(Boolean);
  if (c.zip_code) parts.push(`CEP: ${c.zip_code}`);
  return parts.join(', ') || '';
}

export function DeliveriesTab() {
  const [date, setDate] = useState<Date>(new Date());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [timeSlotFilter, setTimeSlotFilter] = useState('all');
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemSettings>({
    diasFuncionamento: [],
    feriados: [],
    janelasAvulsas: ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00'],
    janelasAssinaturas: ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00'],
  });
  const [rescheduleTarget, setRescheduleTarget] = useState<DeliveryItem | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const { toast } = useToast();

  // Fetch system settings
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('system_settings').select('*');
      if (!data) return;
      const map = new Map(data.map((s) => [s.key, s.value]));
      const get = (key: string, def: any) => {
        const v = map.get(key);
        if (v == null) return def;
        if (typeof v === 'string') {
          try { return JSON.parse(v); } catch { return v; }
        }
        return v;
      };
      setSettings({
        diasFuncionamento: get('dias_funcionamento', ['segunda', 'terca', 'quarta', 'quinta', 'sexta']),
        feriados: get('feriados', []),
        janelasAvulsas: get('janelas_horario_entregas_avulsas', ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00']),
        janelasAssinaturas: get('janelas_horario_entregas_assinaturas', ['08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00']),
      });
    })();
  }, []);

  // Check if selected date is a working day
  const dateStr = format(date, 'yyyy-MM-dd');
  const weekdayMap: Record<number, string> = {
    0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sabado',
  };
  const dayOfWeek = weekdayMap[date.getDay()];
  const isWorkingDay =
    settings.diasFuncionamento.includes(dayOfWeek) && !settings.feriados.includes(dateStr);

  // Fetch deliveries for selected date
  useEffect(() => {
    if (!isWorkingDay) {
      setDeliveries([]);
      setLoading(false);
      return;
    }
    fetchDeliveries();
  }, [dateStr, isWorkingDay]);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const items: DeliveryItem[] = [];

      // 1. Orders with delivery on this date
      // Include orders with confirmed payment OR with delivery_date set (aguardando/em_rota)
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('delivery_date', dateStr)
        .neq('payment_status', 'cancelado')
        .neq('delivery_status', 'cancelado');

      if (ordersErr) throw ordersErr;

      for (const o of orders || []) {
        items.push({
          id: `order-${o.id}`,
          sourceType: 'order',
          sourceId: o.id,
          orderType: 'avulso',
          customerName: o.customer?.name || 'Sem nome',
          customerAddress: o.customer ? buildAddress(o.customer) : '',
          products: (o.items || []).map((i: any) => ({ name: i.product?.name || 'Produto', quantity: i.quantity })),
          totalQuantity: (o.items || []).reduce((s: number, i: any) => s + i.quantity, 0),
          totalAmount: o.total_amount,
          timeSlot: o.delivery_time_slot || 'Sem horário',
          deliveryStatus: o.delivery_status as DeliveryStatus,
          notes: o.notes,
        });
      }

      // 2. Subscription deliveries on this date
      const { data: subDeliveries, error: subErr } = await supabase
        .from('subscription_deliveries')
        .select('*, subscription:subscriptions(*, customer:customers(*), items:subscription_items(*, product:products(*)))')
        .eq('delivery_date', dateStr);

      if (subErr) throw subErr;

      for (const sd of subDeliveries || []) {
        const sub = sd.subscription as any;
        if (!sub) continue;
        const isEmergency = sub.is_emergency === true;
        items.push({
          id: `sub-delivery-${sd.id}`,
          sourceType: 'subscription_delivery',
          sourceId: sd.id,
          orderType: isEmergency ? 'emergencial' : 'assinatura',
          customerName: sub.customer?.name || 'Sem nome',
          customerAddress: sub.customer ? buildAddress(sub.customer) : '',
          products: (sub.items || []).map((i: any) => ({ name: i.product?.name || 'Produto', quantity: i.quantity })),
          totalQuantity: (sub.items || []).reduce((s: number, i: any) => s + i.quantity, 0),
          totalAmount: sd.total_amount,
          timeSlot: sub.delivery_time_slot || 'Sem horário',
          deliveryStatus: sd.delivery_status as DeliveryStatus,
          notes: sd.notes,
        });
      }

      setDeliveries(items);
    } catch (error) {
      console.error('Error fetching deliveries:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar as entregas.' });
    } finally {
      setLoading(false);
    }
  };

  // All unique time slots
  const allTimeSlots = useMemo(() => {
    const slots = new Set<string>([...settings.janelasAvulsas, ...settings.janelasAssinaturas]);
    return Array.from(slots);
  }, [settings]);

  // Filter deliveries
  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (search) {
        const s = search.toLowerCase();
        if (!d.customerName.toLowerCase().includes(s) && !d.customerAddress.toLowerCase().includes(s)) return false;
      }
      if (typeFilter !== 'all' && d.orderType !== typeFilter) return false;
      if (statusFilter !== 'all' && d.deliveryStatus !== statusFilter) return false;
      if (timeSlotFilter !== 'all' && d.timeSlot !== timeSlotFilter) return false;
      return true;
    });
  }, [deliveries, search, typeFilter, statusFilter, timeSlotFilter]);

  // Group by time slot
  const grouped = useMemo(() => {
    const groups: Record<string, DeliveryItem[]> = {};
    for (const d of filtered) {
      const slot = d.timeSlot || 'outro';
      if (!groups[slot]) groups[slot] = [];
      groups[slot].push(d);
    }
    // Sort slots
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, allTimeSlots]);

  const slotLabel = (slot: string) => slot;

  // Actions
  const updateOrderDeliveryStatus = async (delivery: DeliveryItem, status: DeliveryStatus) => {
    try {
      if (delivery.sourceType === 'order') {
        const { error } = await supabase
          .from('orders')
          .update({ delivery_status: status })
          .eq('id', delivery.sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subscription_deliveries')
          .update({ delivery_status: status })
          .eq('id', delivery.sourceId);
        if (error) throw error;
      }
      toast({ title: 'Sucesso', description: `Entrega marcada como ${status === 'entregue' ? 'entregue' : 'cancelada'}.` });
      fetchDeliveries();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível atualizar o status.' });
    }
  };

  const handleUpdateNotes = async (delivery: DeliveryItem, notes: string) => {
    try {
      if (delivery.sourceType === 'order') {
        const { error } = await supabase.from('orders').update({ notes }).eq('id', delivery.sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subscription_deliveries').update({ notes }).eq('id', delivery.sourceId);
        if (error) throw error;
      }
      toast({ title: 'Observação salva' });
      fetchDeliveries();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível salvar a observação.' });
    }
  };

  const handleReschedule = async (newDate: string, timeSlot: string) => {
    if (!rescheduleTarget) return;
    setRescheduleLoading(true);
    try {
      if (rescheduleTarget.sourceType === 'order') {
        const { error } = await supabase
          .from('orders')
          .update({ delivery_date: newDate, delivery_time_slot: timeSlot })
          .eq('id', rescheduleTarget.sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subscription_deliveries')
          .update({ delivery_date: newDate })
          .eq('id', rescheduleTarget.sourceId);
        if (error) throw error;
      }
      toast({ title: 'Entrega reagendada', description: `Nova data: ${newDate}` });
      setRescheduleTarget(null);
      fetchDeliveries();
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível reagendar.' });
    } finally {
      setRescheduleLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <DeliveryFilters
        date={date}
        onDateChange={setDate}
        search={search}
        onSearchChange={setSearch}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        timeSlotFilter={timeSlotFilter}
        onTimeSlotFilterChange={setTimeSlotFilter}
        timeSlots={allTimeSlots}
      />

      {!isWorkingDay ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Sem operação nesta data</p>
          <p className="text-sm">Este dia está fora do funcionamento da empresa ou é feriado.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma entrega encontrada</p>
          <p className="text-sm">
            {deliveries.length > 0 ? 'Ajuste os filtros para ver mais resultados.' : 'Não há entregas agendadas para esta data.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([slot, items]) => (
            <div key={slot}>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold">{slotLabel(slot)}</h3>
                <span className="text-sm text-muted-foreground">
                  ({items.length} entrega{items.length !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {items.map((d) => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    onMarkDelivered={(del) => updateOrderDeliveryStatus(del, 'entregue')}
                    onMarkCancelled={(del) => updateOrderDeliveryStatus(del, 'cancelado')}
                    onReschedule={(del) => setRescheduleTarget(del)}
                    onUpdateNotes={handleUpdateNotes}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RescheduleDialog
        open={!!rescheduleTarget}
        onOpenChange={(open) => !open && setRescheduleTarget(null)}
        onConfirm={handleReschedule}
        timeSlots={allTimeSlots}
        loading={rescheduleLoading}
      />
    </div>
  );
}
