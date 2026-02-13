import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Leaf, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Erro no login',
          description: error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos'
            : error.message,
        });
        return;
      }

      toast({
        title: 'Login realizado com sucesso!',
        description: 'Bem-vindo ao painel administrativo.',
      });
      navigate('/');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro ao fazer login.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Leaf className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Hidroponia Admin</CardTitle>
          <CardDescription>
            Faça login para acessar o painel administrativo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="seu@email.com"
                        {...field}
                      />
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
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Não possui conta? </span>
            <Link to="/cadastro" className="text-primary hover:underline font-medium">
              Cadastre-se
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
