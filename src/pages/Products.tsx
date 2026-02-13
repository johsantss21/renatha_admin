import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { ProductDialog } from '@/components/products/ProductDialog';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data as Product[]);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os produtos.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', selectedProduct.id);

      if (error) throw error;

      toast({
        title: 'Produto excluído',
        description: 'O produto foi removido com sucesso.',
      });
      fetchProducts();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o produto.',
      });
    } finally {
      setDeleteDialogOpen(false);
      setSelectedProduct(null);
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()) ||
    product.code.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Produtos</h1>
            <p className="text-muted-foreground mt-1">Gerencie o catálogo de produtos hidropônicos</p>
          </div>
          <Button onClick={() => { setSelectedProduct(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou código..."
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
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Preço Avulso</TableHead>
                      <TableHead className="text-right">Preço Kit</TableHead>
                      <TableHead className="text-right">Preço Assinatura</TableHead>
                      <TableHead className="text-center">Estoque</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-mono text-sm">{product.code}</TableCell>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.price_single)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.price_kit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.price_subscription)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={product.stock <= product.stock_min ? 'destructive' : 'secondary'}>
                            {product.stock}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={product.active ? 'default' : 'outline'}>
                            {product.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setSelectedProduct(product); setDialogOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
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

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selectedProduct}
        onSuccess={fetchProducts}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O produto "{selectedProduct?.name}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
