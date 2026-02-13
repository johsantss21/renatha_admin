import { useEffect, useState } from 'react';
import { Plus, Eye, Search, Calendar, Truck, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { OrderDialog } from '@/components/orders/OrderDialog';
import { OrderDetailsDialog } from '@/components/orders/OrderDetailsDialog';
import { supabase } from '@/integrations/supabase/client';
import { Order, PaymentStatus, DeliveryStatus } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data as Order[]);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os pedidos.',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(search.toLowerCase()) ||
      order.customer?.name.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus =
      statusFilter === 'all' ||
      order.payment_status === statusFilter ||
      order.delivery_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getPaymentStatusBadge = (status: PaymentStatus) => {
    const variants: Record<PaymentStatus, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      pendente: { variant: 'secondary', label: 'Pendente' },
      confirmado: { variant: 'default', label: 'Confirmado' },
      recusado: { variant: 'destructive', label: 'Recusado' },
      cancelado: { variant: 'destructive', label: 'Cancelado' },
    };
    return variants[status];
  };

  const getDeliveryStatusBadge = (status: DeliveryStatus) => {
    const variants: Record<DeliveryStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      aguardando: { variant: 'secondary', label: 'Aguardando' },
      em_rota: { variant: 'outline', label: 'Em Rota' },
      entregue: { variant: 'default', label: 'Entregue' },
      cancelado: { variant: 'destructive', label: 'Cancelado' },
    };
    return variants[status];
  };

  const getTimeSlotLabel = (slot: string | null) => {
    if (!slot) return '—';
    return slot;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Pedidos</h1>
            <p className="text-muted-foreground mt-1">Gerencie os pedidos avulsos</p>
          </div>
          <Button onClick={() => { setSelectedOrder(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Pedido
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número ou cliente..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pagamento Pendente</SelectItem>
                  <SelectItem value="confirmado">Pagamento Confirmado</SelectItem>
                  <SelectItem value="recusado">Pagamento Recusado</SelectItem>
                  <SelectItem value="aguardando">Entrega Aguardando</SelectItem>
                  <SelectItem value="em_rota">Em Rota</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search || statusFilter !== 'all' ? 'Nenhum pedido encontrado.' : 'Nenhum pedido cadastrado.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <CreditCard className="h-4 w-4" />
                          Pagamento
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Truck className="h-4 w-4" />
                          Entrega
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Data/Horário
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const paymentBadge = getPaymentStatusBadge(order.payment_status);
                      const deliveryBadge = getDeliveryStatusBadge(order.delivery_status);
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                          <TableCell className="font-medium">{order.customer?.name || '—'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(order.total_amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={paymentBadge.variant}>{paymentBadge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={deliveryBadge.variant}>{deliveryBadge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {order.delivery_date ? (
                              <div>
                                <div>{format(new Date(order.delivery_date), 'dd/MM/yyyy', { locale: ptBR })}</div>
                                <div className="text-muted-foreground">{getTimeSlotLabel(order.delivery_time_slot)}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">A definir</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setSelectedOrder(order); setDetailsDialogOpen(true); }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchOrders}
      />

      <OrderDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        order={selectedOrder}
        onSuccess={fetchOrders}
      />
    </AdminLayout>
  );
}
