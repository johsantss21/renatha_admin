import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

const productSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  price_single: z.coerce.number().min(0, 'Preço deve ser positivo'),
  price_kit: z.coerce.number().min(0, 'Preço deve ser positivo'),
  price_subscription: z.coerce.number().min(0, 'Preço deve ser positivo'),
  stock: z.coerce.number().int().min(0, 'Estoque deve ser positivo'),
  stock_min: z.coerce.number().int().min(0, 'Estoque mínimo deve ser positivo'),
  stock_max: z.coerce.number().int().min(0, 'Estoque máximo deve ser positivo'),
  active: z.boolean(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}

export function ProductDialog({ open, onOpenChange, product, onSuccess }: ProductDialogProps) {
  const { toast } = useToast();
  const isEditing = !!product;
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price_single: 0,
      price_kit: 0,
      price_subscription: 0,
      stock: 0,
      stock_min: 0,
      stock_max: 0,
      active: true,
    },
  });

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        description: product.description || '',
        price_single: product.price_single,
        price_kit: product.price_kit,
        price_subscription: product.price_subscription,
        stock: product.stock,
        stock_min: product.stock_min,
        stock_max: product.stock_max,
        active: product.active,
      });
      setImageUrl(product.images?.[0] || '');
    } else {
      form.reset({
        name: '',
        description: '',
        price_single: 0,
        price_kit: 0,
        price_subscription: 0,
        stock: 0,
        stock_min: 0,
        stock_max: 0,
        active: true,
      });
      setImageUrl('');
    }
  }, [product, form]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Tipo de arquivo inválido',
        description: 'Use apenas imagens JPG, PNG, WebP ou GIF.',
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo é 5MB.',
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      setImageUrl(publicUrl);
      toast({
        title: 'Imagem enviada',
        description: 'A imagem foi carregada com sucesso.',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        variant: 'destructive',
        title: 'Erro no upload',
        description: 'Não foi possível enviar a imagem. Verifique se você tem permissão de admin.',
      });
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageUrl('');
  };

  const onSubmit = async (data: ProductFormData) => {
    try {
      const productData = {
        name: data.name,
        description: data.description || null,
        price_single: data.price_single,
        price_kit: data.price_kit,
        price_subscription: data.price_subscription,
        stock: data.stock,
        stock_min: data.stock_min,
        stock_max: data.stock_max,
        active: data.active,
        images: imageUrl ? [imageUrl] : [],
      };

      if (isEditing) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', product.id);

        if (error) throw error;

        toast({
          title: 'Produto atualizado',
          description: 'As alterações foram salvas com sucesso.',
        });
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData);

        if (error) throw error;

        toast({
          title: 'Produto criado',
          description: 'O novo produto foi adicionado ao catálogo.',
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível salvar o produto.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Atualize as informações do produto.' : 'Preencha os dados do novo produto.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Image Upload */}
            <div className="space-y-2">
              <FormLabel>Imagem do Produto</FormLabel>
              {imageUrl ? (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border">
                  <img
                    src={imageUrl}
                    alt="Product"
                    className="w-full h-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removeImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {uploading ? (
                      <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                    ) : (
                      <>
                        <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold">Clique para enviar</span> ou arraste a imagem
                        </p>
                        <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou GIF (máx. 5MB)</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleImageUpload}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Alface Crespa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o produto..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="price_single"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço Avulso *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_kit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço em Kit</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price_subscription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço em Assinatura</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque Atual *</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stock_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque Mínimo *</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormDescription>Para alertas</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stock_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque Máximo</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormDescription>Referência</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Produto Ativo</FormLabel>
                    <FormDescription>
                      Produtos inativos não aparecem no catálogo
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  isEditing ? 'Salvar Alterações' : 'Criar Produto'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
