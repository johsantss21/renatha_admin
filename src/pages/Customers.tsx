import { useEffect, useState } from 'react';
import { Plus, Pencil, Search, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CustomerDialog } from '@/components/customers/CustomerDialog';
import { supabase } from '@/integrations/supabase/client';
import { Customer } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data as Customer[]);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os clientes.',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(search.toLowerCase()) ||
    customer.cpf_cnpj.includes(search) ||
    customer.phone.includes(search)
  );

  const formatCpfCnpj = (value: string) => {
    if (value.length === 11) {
      return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="text-muted-foreground mt-1">Gerencie a base de clientes</p>
          </div>
          <Button onClick={() => { setSelectedCustomer(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead className="text-center">Validado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>
                          <Badge variant={customer.customer_type === 'PJ' ? 'default' : 'secondary'}>
                            {customer.customer_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatCpfCnpj(customer.cpf_cnpj)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm">
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              {formatPhone(customer.phone)}
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {customer.city && customer.state ? (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              {customer.city}/{customer.state}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={customer.validated ? 'default' : 'outline'}>
                            {customer.validated ? 'Sim' : 'Não'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedCustomer(customer); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={selectedCustomer}
        onSuccess={fetchCustomers}
      />
    </AdminLayout>
  );
}
