import { useEffect, useState } from 'react';
import { Plus, Eye, Search, Calendar, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { SubscriptionDialog } from '@/components/subscriptions/SubscriptionDialog';
import { SubscriptionDetailsDialog } from '@/components/subscriptions/SubscriptionDetailsDialog';
import { supabase } from '@/integrations/supabase/client';
import { Subscription, SubscriptionStatus } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          customer:customers(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data as Subscription[]);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar as assinaturas.',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.subscription_number.toLowerCase().includes(search.toLowerCase()) ||
      sub.customer?.name.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: SubscriptionStatus) => {
    const variants: Record<SubscriptionStatus, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      ativa: { variant: 'default', label: 'Ativa' },
      pausada: { variant: 'secondary', label: 'Pausada' },
      cancelada: { variant: 'destructive', label: 'Cancelada' },
    };
    return variants[status];
  };

  const getWeekdayLabel = (weekday: string) => {
    const labels: Record<string, string> = {
      domingo: 'Domingo',
      segunda: 'Segunda',
      terca: 'Terça',
      quarta: 'Quarta',
      quinta: 'Quinta',
      sexta: 'Sexta',
      sabado: 'Sábado',
    };
    return labels[weekday] || weekday;
  };

  const getTimeSlotLabel = (slot: string) => {
    if (slot === 'manha') return '08:00–12:00';
    if (slot === 'tarde') return '12:00–16:00';
    return slot;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      diaria: 'Diária',
      semanal: 'Semanal',
      quinzenal: 'Quinzenal',
      mensal: 'Mensal',
    };
    return labels[frequency] || frequency || 'Semanal';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Assinaturas</h1>
            <p className="text-muted-foreground mt-1">Gerencie as assinaturas recorrentes</p>
          </div>
          <Button onClick={() => { setSelectedSubscription(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Assinatura
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
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredSubscriptions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search || statusFilter !== 'all' ? 'Nenhuma assinatura encontrada.' : 'Nenhuma assinatura cadastrada.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assinatura</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center">Recorrência</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Entrega
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Valor Mensal</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <RefreshCw className="h-4 w-4" />
                          Status
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((subscription) => {
                      const statusBadge = getStatusBadge(subscription.status);
                      
                      return (
                        <TableRow key={subscription.id}>
                          <TableCell className="font-mono text-sm">
                            {subscription.subscription_number}
                            {(subscription as any).is_emergency && (
                              <Badge variant="outline" className="ml-2 gap-1"><Zap className="h-3 w-3" />Emergencial</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{subscription.customer?.name || '—'}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">
                              {(subscription as any).is_emergency ? 'Avulso' : getFrequencyLabel((subscription as any).frequency)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="text-sm">
                              <div>{getWeekdayLabel(subscription.delivery_weekday)}</div>
                              <div className="text-muted-foreground">{getTimeSlotLabel(subscription.delivery_time_slot)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(subscription.total_amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setSelectedSubscription(subscription); setDetailsDialogOpen(true); }}
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

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchSubscriptions}
      />

      <SubscriptionDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        subscription={selectedSubscription}
        onSuccess={fetchSubscriptions}
      />
    </AdminLayout>
  );
}
