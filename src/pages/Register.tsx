import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Leaf, Loader2, Search, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { validateCPF, validateCNPJ, formatCPF, formatCNPJ, formatCEP, formatPhone } from '@/lib/validators';
import { Badge } from '@/components/ui/badge';

const registerSchema = z.object({
  // Credenciais
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string(),
  // Dados pessoais
  fullName: z.string().min(3, 'Nome completo é obrigatório'),
  cpf: z.string().refine((val) => validateCPF(val), 'CPF inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  // Dados da empresa
  cnpj: z.string().refine((val) => validateCNPJ(val), 'CNPJ inválido'),
  companyName: z.string().min(3, 'Razão social é obrigatória'),
  tradingName: z.string().optional(),
  companyEmail: z.string().email('E-mail inválido').optional().or(z.literal('')),
  companyPhone: z.string().optional(),
  // Endereço
  zipCode: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function Register() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjValidated, setCnpjValidated] = useState(false);
  const [activeTab, setActiveTab] = useState('credentials');
  const [signupCooldownSec, setSignupCooldownSec] = useState(0);

  useEffect(() => {
    if (signupCooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setSignupCooldownSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [signupCooldownSec]);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      cpf: '',
      phone: '',
      cnpj: '',
      companyName: '',
      tradingName: '',
      companyEmail: '',
      companyPhone: '',
      zipCode: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
    },
  });

  // Consultar CNPJ na Brasil API
  const consultarCNPJ = async () => {
    const cnpj = form.getValues('cnpj');
    if (!validateCNPJ(cnpj)) {
      toast({
        variant: 'destructive',
        title: 'CNPJ inválido',
        description: 'Por favor, digite um CNPJ válido.',
      });
      return;
    }

    setCnpjLoading(true);
    setCnpjValidated(false);

    try {

      // Usar query params via fetch direto
      const response = await fetch(
        `https://infresxpaglulwiooanc.supabase.co/functions/v1/validate-document?type=cnpj&value=${cnpj.replace(/\D/g, '')}`,
        {
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erro ao consultar CNPJ');
      }

      const cnpjData = result.data;

      // Preencher formulário automaticamente
      form.setValue('companyName', cnpjData.razao_social || '');
      form.setValue('tradingName', cnpjData.nome_fantasia || '');
      form.setValue('companyEmail', cnpjData.email || '');
      form.setValue('companyPhone', cnpjData.telefone || '');
      form.setValue('street', cnpjData.logradouro || '');
      form.setValue('number', cnpjData.numero || '');
      form.setValue('complement', cnpjData.complemento || '');
      form.setValue('neighborhood', cnpjData.bairro || '');
      form.setValue('city', cnpjData.municipio || '');
      form.setValue('state', cnpjData.uf || '');
      form.setValue('zipCode', cnpjData.cep || '');

      setCnpjValidated(true);
      toast({
        title: 'CNPJ validado!',
        description: `Dados de ${cnpjData.razao_social} preenchidos automaticamente.`,
      });
    } catch (error: any) {
      console.error('Erro ao consultar CNPJ:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao consultar CNPJ',
        description: error.message || 'Não foi possível consultar o CNPJ. Preencha manualmente.',
      });
    } finally {
      setCnpjLoading(false);
    }
  };

  // Consultar CEP
  const consultarCEP = async () => {
    const cep = form.getValues('zipCode');
    if (!cep || cep.replace(/\D/g, '').length !== 8) {
      return;
    }

    setCepLoading(true);

    try {
      const response = await fetch(
        `https://infresxpaglulwiooanc.supabase.co/functions/v1/validate-document?type=cep&value=${cep.replace(/\D/g, '')}`
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erro ao consultar CEP');
      }

      const cepData = result.data;
      form.setValue('street', cepData.logradouro || '');
      form.setValue('neighborhood', cepData.bairro || '');
      form.setValue('city', cepData.cidade || '');
      form.setValue('state', cepData.estado || '');

      toast({
        title: 'CEP encontrado!',
        description: 'Endereço preenchido automaticamente.',
      });
    } catch (error: any) {
      console.error('Erro ao consultar CEP:', error);
    } finally {
      setCepLoading(false);
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    if (signupCooldownSec > 0) return;

    setLoading(true);
    try {
      // Criar usuário no Auth + enviar os dados do operador como metadata
      // O perfil e a role de admin (se for o primeiro usuário) são criados via trigger no banco.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            profile_type: 'operator',
            full_name: data.fullName.trim(),
            cpf: data.cpf.replace(/\D/g, ''),
            phone: data.phone.replace(/\D/g, ''),
            cnpj: data.cnpj.replace(/\D/g, ''),
            company_name: data.companyName.trim(),
            trading_name: data.tradingName?.trim() || '',
            company_email: data.companyEmail?.trim() || '',
            company_phone: data.companyPhone?.replace(/\D/g, '') || '',
            zip_code: data.zipCode?.replace(/\D/g, '') || '',
            street: data.street?.trim() || '',
            number: data.number?.trim() || '',
            complement: data.complement?.trim() || '',
            neighborhood: data.neighborhood?.trim() || '',
            city: data.city?.trim() || '',
            state: data.state?.trim() || '',
            cnpj_validated: cnpjValidated,
          },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Erro ao criar usuário');

      toast({
        title: 'Cadastro realizado com sucesso!',
        description: 'Enviamos um e-mail de confirmação. Após confirmar, faça login.',
      });

      navigate('/login');
    } catch (error: any) {
      const message = String(error?.message || '');
      const status = Number(error?.status || 0);
      const code = String(error?.code || '');

      if (status === 429 || code === 'over_email_send_rate_limit') {
        const match = /after\s+(\d+)\s+seconds/i.exec(message);
        const secs = match ? Number(match[1]) : 60;
        setSignupCooldownSec((prev) => Math.max(prev, secs));
      }

      console.error('Erro no cadastro:', error);
      toast({
        variant: 'destructive',
        title: 'Erro no cadastro',
        description: message || 'Não foi possível completar o cadastro.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Formatar campos automaticamente
  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      form.setValue('cpf', formatCPF(value));
    }
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 14) {
      form.setValue('cnpj', formatCNPJ(value));
      setCnpjValidated(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'phone' | 'companyPhone') => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      form.setValue(field, formatPhone(value));
    }
  };

  const handleCEPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      form.setValue('zipCode', formatCEP(value));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/20 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Leaf className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Cadastro de Operador</CardTitle>
          <CardDescription>
            Preencha os dados para criar sua conta de administrador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="credentials">Acesso</TabsTrigger>
                  <TabsTrigger value="personal">Pessoal</TabsTrigger>
                  <TabsTrigger value="company">Empresa</TabsTrigger>
                </TabsList>

                {/* Tab: Credenciais */}
                <TabsContent value="credentials" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail de acesso</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="seu@email.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirmar senha</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setActiveTab('personal')}
                  >
                    Próximo: Dados Pessoais
                  </Button>
                </TabsContent>

                {/* Tab: Dados Pessoais */}
                <TabsContent value="personal" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome completo</FormLabel>
                        <FormControl>
                          <Input placeholder="Seu nome completo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cpf"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CPF</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="000.000.000-00"
                              {...field}
                              onChange={handleCPFChange}
                              maxLength={14}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone / WhatsApp</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="(00) 00000-0000"
                              {...field}
                              onChange={(e) => handlePhoneChange(e, 'phone')}
                              maxLength={15}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab('credentials')}
                    >
                      Voltar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setActiveTab('company')}
                    >
                      Próximo: Dados da Empresa
                    </Button>
                  </div>
                </TabsContent>

                {/* Tab: Dados da Empresa */}
                <TabsContent value="company" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="cnpj"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          CNPJ
                          {cnpjValidated && (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Validado
                            </Badge>
                          )}
                        </FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="00.000.000/0000-00"
                              {...field}
                              onChange={handleCNPJChange}
                              maxLength={18}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={consultarCNPJ}
                            disabled={cnpjLoading}
                          >
                            {cnpjLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Search className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <FormDescription>
                          Clique na lupa para preencher automaticamente os dados da empresa
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Razão Social</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome da empresa" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="tradingName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Fantasia</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome fantasia (opcional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="companyEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail da empresa</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contato@empresa.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telefone da empresa</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="(00) 0000-0000"
                              {...field}
                              onChange={(e) => handlePhoneChange(e, 'companyPhone')}
                              maxLength={15}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Endereço */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-medium mb-4">Endereço da Empresa</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CEP</FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <Input
                                  placeholder="00000-000"
                                  {...field}
                                  onChange={handleCEPChange}
                                  onBlur={consultarCEP}
                                  maxLength={9}
                                />
                              </FormControl>
                              {cepLoading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="street"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Rua</FormLabel>
                            <FormControl>
                              <Input placeholder="Nome da rua" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <FormField
                        control={form.control}
                        name="number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número</FormLabel>
                            <FormControl>
                              <Input placeholder="123" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="complement"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Complemento</FormLabel>
                            <FormControl>
                              <Input placeholder="Apto, Sala" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="neighborhood"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bairro</FormLabel>
                            <FormControl>
                              <Input placeholder="Bairro" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cidade</FormLabel>
                            <FormControl>
                              <Input placeholder="Cidade" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <FormControl>
                              <Input placeholder="UF" maxLength={2} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab('personal')}
                    >
                      Voltar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={loading || signupCooldownSec > 0}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Cadastrando...
                        </>
                      ) : signupCooldownSec > 0 ? (
                        `Aguarde ${signupCooldownSec}s`
                      ) : (
                        'Criar Conta'
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Já possui uma conta? </span>
            <Link to="/login" className="text-primary hover:underline font-medium">
              Fazer login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
