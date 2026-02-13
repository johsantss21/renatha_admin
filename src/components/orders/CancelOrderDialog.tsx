import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Order } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

const cancelSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  reason: z.string().optional(),
});

type CancelFormData = z.infer<typeof cancelSchema>;

interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onSuccess: () => void;
}

export function CancelOrderDialog({ open, onOpenChange, order, onSuccess }: CancelOrderDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<CancelFormData>({
    resolver: zodResolver(cancelSchema),
    defaultValues: {
      email: '',
      password: '',
      reason: '',
    },
  });

  const onSubmit = async (data: CancelFormData) => {
    if (!order) return;

    setLoading(true);
    setError(null);

    try {
      // Verificar credenciais do usuário
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        setError('Credenciais inválidas. Verifique e-mail e senha.');
        setLoading(false);
        return;
      }

      // Verificar se o usuário é admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authData.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        setError('Usuário não tem permissão para cancelar pedidos.');
        setLoading(false);
        return;
      }

      // Registrar log de cancelamento
      const { error: logError } = await supabase
        .from('order_cancellation_logs')
        .insert({
          order_id: order.id,
          cancelled_by: authData.user.id,
          cancelled_by_email: data.email,
          reason: data.reason || null,
          previous_payment_status: order.payment_status,
          previous_delivery_status: order.delivery_status,
        });

      if (logError) {
        console.error('Error creating cancellation log:', logError);
        throw new Error('Erro ao registrar log de cancelamento');
      }

      // Atualizar pedido como cancelado
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'cancelado',
          delivery_status: 'cancelado',
          cancelled_at: new Date().toISOString(),
          cancelled_by: authData.user.id,
          cancellation_reason: data.reason || null,
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      toast({
        title: 'Pedido cancelado',
        description: `Pedido ${order.order_number} foi cancelado com sucesso.`,
      });

      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error cancelling order:', error);
      setError(error.message || 'Não foi possível cancelar o pedido.');
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Cancelar Pedido
          </DialogTitle>
          <DialogDescription>
            Esta ação é irreversível. O pedido {order.order_number} será marcado como cancelado.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Para cancelar este pedido, você precisa confirmar sua identidade.
              </AlertDescription>
            </Alert>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail do Administrador</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="seu@email.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo do Cancelamento (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo do cancelamento..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Voltar
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  'Confirmar Cancelamento'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
