import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { DollarSign, ShoppingCart, XCircle, TrendingUp, Users, Truck, Clock, Package } from 'lucide-react';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface KPIData {
  faturamentoTotal: number;
  faturamentoMes: number;
  pedidosPagos: number;
  cancelamentos: number;
  ticketMedioPF: number;
  ticketMedioPJ: number;
  assinativasAtivasPF: number;
  assinativasAtivasPJ: number;
  entregasRealizadas: number;
  pedidosAtraso: number;
  produtosMaisVendidos: { name: string; quantity: number }[];
  evolucaoMensal: { month: string; pedidos: number; faturamento: number }[];
}

export function DashboardKPIs() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mesAno, setMesAno] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [tipoCliente, setTipoCliente] = useState('all');
  const [tipoPedido, setTipoPedido] = useState('all');

  useEffect(() => {
    fetchKPIs();
  }, [mesAno, tipoCliente, tipoPedido]);

  const fetchKPIs = async () => {
    setLoading(true);
    try {
      const [year, month] = mesAno.split('-').map(Number);
      const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      // Fetch all orders with customers
      const { data: allOrders } = await supabase
        .from('orders')
        .select('*, customer:customers(customer_type)')
        .order('created_at', { ascending: true });

      // Fetch subscriptions with customers
      const { data: allSubs } = await supabase
        .from('subscriptions')
        .select('*, customer:customers(customer_type)')
        .order('created_at', { ascending: true });

      // Fetch subscription deliveries for the month
      const { data: subDeliveries } = await supabase
        .from('subscription_deliveries')
        .select('*, subscription:subscriptions(is_emergency)')
        .gte('delivery_date', startOfMonth)
        .lte('delivery_date', endOfMonth);

      // Fetch order items for top products
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('quantity, product:products(name)');

      const { data: subItems } = await supabase
        .from('subscription_items')
        .select('quantity, product:products(name)');

      const orders = allOrders || [];
      const subs = allSubs || [];

      // Apply filters
      const filterByType = (items: any[]) => {
        if (tipoCliente === 'all') return items;
        return items.filter((i: any) => i.customer?.customer_type === tipoCliente);
      };

      const filteredOrders = filterByType(orders);
      const filteredSubs = filterByType(subs);

      // Filter by tipoPedido
      const relevantOrders = tipoPedido === 'all' || tipoPedido === 'avulso' ? filteredOrders : [];
      const relevantSubs = tipoPedido === 'all' || tipoPedido === 'assinatura' ? filteredSubs.filter((s: any) => !s.is_emergency) : [];
      const emergencySubs = tipoPedido === 'all' || tipoPedido === 'emergencial' ? filteredSubs.filter((s: any) => s.is_emergency) : [];

      // KPI calculations
      const paidOrders = relevantOrders.filter((o: any) => o.payment_status === 'confirmado');
      const paidSubs = [...relevantSubs, ...emergencySubs].filter((s: any) => s.status === 'ativa');

      const faturamentoTotal = paidOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0)
        + paidSubs.reduce((s: number, o: any) => s + Number(o.total_amount), 0);

      // Month specific
      const monthOrders = paidOrders.filter((o: any) => o.created_at >= startOfMonth && o.created_at <= endOfMonth + 'T23:59:59');
      const monthSubs = paidSubs.filter((s: any) => s.created_at >= startOfMonth && s.created_at <= endOfMonth + 'T23:59:59');
      const faturamentoMes = monthOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0)
        + monthSubs.reduce((s: number, o: any) => s + Number(o.total_amount), 0);

      const cancelamentos = relevantOrders.filter((o: any) => o.payment_status === 'cancelado').length
        + [...relevantSubs, ...emergencySubs].filter((s: any) => s.status === 'cancelada').length;

      // Ticket médio
      const pfOrders = paidOrders.filter((o: any) => o.customer?.customer_type === 'PF');
      const pjOrders = paidOrders.filter((o: any) => o.customer?.customer_type === 'PJ');
      const ticketMedioPF = pfOrders.length > 0 ? pfOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0) / pfOrders.length : 0;
      const ticketMedioPJ = pjOrders.length > 0 ? pjOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0) / pjOrders.length : 0;

      // Active subs by type
      const activeSubs = subs.filter((s: any) => s.status === 'ativa');
      const assinativasAtivasPF = activeSubs.filter((s: any) => s.customer?.customer_type === 'PF').length;
      const assinativasAtivasPJ = activeSubs.filter((s: any) => s.customer?.customer_type === 'PJ').length;

      // Deliveries this month
      const deliveredThisMonth = (subDeliveries || []).filter((d: any) => d.delivery_status === 'entregue').length;
      const orderDeliveries = relevantOrders.filter((o: any) =>
        o.delivery_date >= startOfMonth && o.delivery_date <= endOfMonth && o.delivery_status === 'entregue'
      ).length;
      const entregasRealizadas = deliveredThisMonth + orderDeliveries;

      // Late orders
      const today = new Date().toISOString().split('T')[0];
      const pedidosAtraso = relevantOrders.filter((o: any) =>
        o.delivery_date && o.delivery_date < today && o.delivery_status === 'aguardando'
      ).length;

      // Top products
      const productMap = new Map<string, number>();
      for (const item of (orderItems || [])) {
        const name = (item as any).product?.name || 'Desconhecido';
        productMap.set(name, (productMap.get(name) || 0) + item.quantity);
      }
      for (const item of (subItems || [])) {
        const name = (item as any).product?.name || 'Desconhecido';
        productMap.set(name, (productMap.get(name) || 0) + item.quantity);
      }
      const produtosMaisVendidos = Array.from(productMap.entries())
        .map(([name, quantity]) => ({ name, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      // Monthly evolution (last 6 months)
      const evolucaoMensal: { month: string; pedidos: number; faturamento: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const mEndStr = `${mEnd.getFullYear()}-${String(mEnd.getMonth() + 1).padStart(2, '0')}-${String(mEnd.getDate()).padStart(2, '0')}`;
        const mLabel = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

        const mOrders = paidOrders.filter((o: any) => o.created_at >= mStart && o.created_at <= mEndStr + 'T23:59:59');
        const mSubs = paidSubs.filter((s: any) => s.created_at >= mStart && s.created_at <= mEndStr + 'T23:59:59');
        evolucaoMensal.push({
          month: mLabel,
          pedidos: mOrders.length + mSubs.length,
          faturamento: mOrders.reduce((s: number, o: any) => s + Number(o.total_amount), 0) + mSubs.reduce((s: number, o: any) => s + Number(o.total_amount), 0),
        });
      }

      setData({
        faturamentoTotal,
        faturamentoMes,
        pedidosPagos: paidOrders.length + paidSubs.length,
        cancelamentos,
        ticketMedioPF,
        ticketMedioPJ,
        assinativasAtivasPF,
        assinativasAtivasPJ,
        entregasRealizadas,
        pedidosAtraso,
        produtosMaisVendidos,
        evolucaoMensal,
      });
    } catch (error) {
      console.error('Error fetching KPIs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Generate month options
  const monthOptions = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    monthOptions.push({ value: val, label });
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const kpiCards = [
    { title: 'Faturamento Total', value: formatCurrency(data.faturamentoTotal), icon: DollarSign, color: 'text-emerald-600' },
    { title: 'Faturamento do Mês', value: formatCurrency(data.faturamentoMes), icon: TrendingUp, color: 'text-blue-600' },
    { title: 'Pedidos Pagos', value: data.pedidosPagos, icon: ShoppingCart, color: 'text-purple-600' },
    { title: 'Cancelamentos', value: data.cancelamentos, icon: XCircle, color: 'text-destructive' },
    { title: 'Ticket Médio PF', value: formatCurrency(data.ticketMedioPF), icon: Users, color: 'text-orange-600' },
    { title: 'Ticket Médio PJ', value: formatCurrency(data.ticketMedioPJ), icon: Users, color: 'text-indigo-600' },
    { title: 'Assinaturas PF', value: data.assinativasAtivasPF, icon: Users, color: 'text-teal-600' },
    { title: 'Assinaturas PJ', value: data.assinativasAtivasPJ, icon: Users, color: 'text-cyan-600' },
    { title: 'Entregas Realizadas', value: data.entregasRealizadas, icon: Truck, color: 'text-green-600' },
    { title: 'Pedidos em Atraso', value: data.pedidosAtraso, icon: Clock, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={mesAno} onValueChange={setMesAno}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Mês / Ano" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tipoCliente} onValueChange={setTipoCliente}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PF">PF</SelectItem>
            <SelectItem value="PJ">PJ</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipoPedido} onValueChange={setTipoPedido}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo Pedido" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="avulso">Avulso</SelectItem>
            <SelectItem value="assinatura">Assinatura</SelectItem>
            <SelectItem value="emergencial">Emergencial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                  <p className="text-xs font-medium text-muted-foreground">{kpi.title}</p>
                </div>
                <p className="text-xl font-bold">{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number, name: string) => [name === 'faturamento' ? formatCurrency(value) : value, name === 'faturamento' ? 'Faturamento' : 'Pedidos']} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="pedidos" name="Pedidos" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="faturamento" name="Faturamento" stroke="hsl(142 76% 36%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produtos Mais Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            {data.produtosMaisVendidos.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Sem dados de vendas</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.produtosMaisVendidos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Quantidade" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
