import { useEffect, useState } from 'react';
import { Package, Users, ShoppingCart, RefreshCw, TrendingUp, AlertCircle, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { DeliveriesTab } from '@/components/deliveries/DeliveriesTab';

interface DashboardStats {
  totalProducts: number;
  totalCustomers: number;
  totalOrders: number;
  totalSubscriptions: number;
  pendingOrders: number;
  activeSubscriptions: number;
  lowStockProducts: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalSubscriptions: 0,
    pendingOrders: 0,
    activeSubscriptions: 0,
    lowStockProducts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [
        { count: totalProducts },
        { count: totalCustomers },
        { count: totalOrders },
        { count: totalSubscriptions },
        { count: pendingOrders },
        { count: activeSubscriptions },
      ] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }),
        supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'pendente'),
        supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'ativa'),
      ]);

      // Calculate low stock products by comparing stock to stock_min
      const { data: productsData } = await supabase
        .from('products')
        .select('stock, stock_min')
        .eq('active', true);
      
      const lowStockCount = productsData?.filter(p => p.stock <= p.stock_min).length || 0;

      setStats({
        totalProducts: totalProducts || 0,
        totalCustomers: totalCustomers || 0,
        totalOrders: totalOrders || 0,
        totalSubscriptions: totalSubscriptions || 0,
        pendingOrders: pendingOrders || 0,
        activeSubscriptions: activeSubscriptions || 0,
        lowStockProducts: lowStockCount,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Produtos Ativos',
      value: stats.totalProducts,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Clientes',
      value: stats.totalCustomers,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      title: 'Pedidos',
      value: stats.totalOrders,
      icon: ShoppingCart,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
    {
      title: 'Assinaturas',
      value: stats.totalSubscriptions,
      icon: RefreshCw,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
  ];

  const alertCards = [
    {
      title: 'Pedidos Pendentes',
      value: stats.pendingOrders,
      icon: TrendingUp,
      description: 'Aguardando confirmação de pagamento',
    },
    {
      title: 'Assinaturas Ativas',
      value: stats.activeSubscriptions,
      icon: RefreshCw,
      description: 'Entregas recorrentes programadas',
    },
    {
      title: 'Estoque Baixo',
      value: stats.lowStockProducts,
      icon: AlertCircle,
      description: 'Produtos abaixo do estoque mínimo',
    },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral do sistema</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="deliveries" className="gap-1.5">
              <Truck className="h-4 w-4" />
              Entregas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                          <p className="text-3xl font-bold mt-2">{card.value}</p>
                        </div>
                        <div className={`p-3 rounded-full ${card.bgColor}`}>
                          <Icon className={`h-6 w-6 ${card.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Alert Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {alertCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.title}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        {card.title}
                      </CardTitle>
                      <CardDescription>{card.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-4xl font-bold text-primary">{card.value}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="deliveries">
            <DeliveriesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
