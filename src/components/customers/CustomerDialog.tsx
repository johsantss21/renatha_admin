import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Search, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Customer, CustomerType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { validateCPF, validateCNPJ } from '@/lib/validators';
import { Badge } from '@/components/ui/badge';

const customerSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  trading_name: z.string().optional(),
  responsible_name: z.string().optional(),
  responsible_contact: z.string().optional(),
  customer_type: z.enum(['PF', 'PJ']),
  cpf_cnpj: z.string().min(11, 'CPF/CNPJ inválido'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().min(10, 'Telefone inválido'),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  validated: z.boolean(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSuccess: () => void;
}

export function CustomerDialog({ open, onOpenChange, customer, onSuccess }: CustomerDialogProps) {
  const { toast } = useToast();
  const isEditing = !!customer;
  const [validating, setValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid' | 'not_found'>('idle');
  const [validationData, setValidationData] = useState<Record<string, unknown> | null>(null);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      trading_name: '',
      responsible_name: '',
      responsible_contact: '',
      customer_type: 'PF',
      cpf_cnpj: '',
      email: '',
      phone: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zip_code: '',
      validated: false,
    },
  });

  const customerType = form.watch('customer_type');
  const cpfCnpj = form.watch('cpf_cnpj');

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name,
        trading_name: customer.trading_name || '',
        responsible_name: customer.responsible_name || '',
        responsible_contact: customer.responsible_contact || '',
        customer_type: customer.customer_type as CustomerType,
        cpf_cnpj: customer.cpf_cnpj,
        email: customer.email || '',
        phone: customer.phone,
        street: customer.street || '',
        number: customer.number || '',
        complement: customer.complement || '',
        neighborhood: customer.neighborhood || '',
        city: customer.city || '',
        state: customer.state || '',
        zip_code: customer.zip_code || '',
        validated: customer.validated,
      });
      setValidationStatus(customer.validated ? 'valid' : 'idle');
      setValidationData(customer.validation_data);
    } else {
      form.reset({
        name: '',
        trading_name: '',
        responsible_name: '',
        responsible_contact: '',
        customer_type: 'PF',
        cpf_cnpj: '',
        email: '',
        phone: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: '',
        validated: false,
      });
      setValidationStatus('idle');
      setValidationData(null);
    }
  }, [customer, form, open]);

  // Detectar tipo automaticamente baseado no tamanho do documento
  useEffect(() => {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');
    if (cleanDoc.length === 11) {
      form.setValue('customer_type', 'PF');
    } else if (cleanDoc.length === 14) {
      form.setValue('customer_type', 'PJ');
    }
  }, [cpfCnpj, form]);

  const validateDocument = async () => {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');
    
    // Validar localmente primeiro
    if (cleanDoc.length === 11) {
      if (!validateCPF(cleanDoc)) {
        setValidationStatus('invalid');
        toast({
          variant: 'destructive',
          title: 'CPF inválido',
          description: 'O CPF informado não é válido.',
        });
        return;
      }
      // CPF válido localmente, mas sem consulta de API
      setValidationStatus('valid');
      form.setValue('validated', true);
      toast({
        title: 'CPF válido',
        description: 'CPF validado com sucesso.',
      });
      return;
    }
    
    if (cleanDoc.length === 14) {
      if (!validateCNPJ(cleanDoc)) {
        setValidationStatus('invalid');
        toast({
          variant: 'destructive',
          title: 'CNPJ inválido',
          description: 'O CNPJ informado não é válido.',
        });
        return;
      }
      
      // Consultar API externa para CNPJ
      setValidating(true);
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-document?type=cnpj&value=${cleanDoc}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok || result.error) {
          throw new Error(result.error || 'Erro ao consultar CNPJ');
        }

        const cnpjData = result.data;
        
        // Preencher campos automaticamente
        form.setValue('name', cnpjData.razao_social || '');
        form.setValue('trading_name', cnpjData.nome_fantasia || '');
        form.setValue('street', cnpjData.logradouro || '');
        form.setValue('number', cnpjData.numero || '');
        form.setValue('complement', cnpjData.complemento || '');
        form.setValue('neighborhood', cnpjData.bairro || '');
        form.setValue('city', cnpjData.municipio || '');
        form.setValue('state', cnpjData.uf || '');
        form.setValue('zip_code', cnpjData.cep?.replace(/\D/g, '') || '');
        if (cnpjData.email) form.setValue('email', cnpjData.email);
        if (cnpjData.telefone) {
          const phone = cnpjData.telefone.replace(/\D/g, '');
          if (phone.length >= 10) form.setValue('phone', phone);
        }
        
        form.setValue('validated', true);
        setValidationStatus('valid');
        setValidationData(cnpjData);
        
        toast({
          title: 'CNPJ validado',
          description: `Dados de ${cnpjData.razao_social} preenchidos automaticamente.`,
        });
      } catch (error: any) {
        console.error('Error validating CNPJ:', error);
        setValidationStatus('not_found');
        toast({
          variant: 'destructive',
          title: 'Erro na validação',
          description: error.message || 'Não foi possível validar o CNPJ.',
        });
      } finally {
        setValidating(false);
      }
      return;
    }
    
    toast({
      variant: 'destructive',
      title: 'Documento inválido',
      description: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
    });
  };

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-document?type=cep&value=${cleanCep}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.data) {
        form.setValue('street', result.data.logradouro || '');
        form.setValue('neighborhood', result.data.bairro || '');
        form.setValue('city', result.data.cidade || '');
        form.setValue('state', result.data.estado || '');
        
        toast({
          title: 'CEP encontrado',
          description: 'Endereço preenchido automaticamente.',
        });
      }
    } catch (error) {
      console.error('Error fetching address:', error);
    }
  };

  const onSubmit = async (data: CustomerFormData) => {
    try {
      // Verificar duplicidade de CPF/CNPJ
      const cleanDoc = data.cpf_cnpj.replace(/\D/g, '');
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('cpf_cnpj', cleanDoc)
        .neq('id', customer?.id || '00000000-0000-0000-0000-000000000000')
        .maybeSingle();

      if (existing) {
        toast({
          variant: 'destructive',
          title: 'Documento duplicado',
          description: 'Já existe um cliente cadastrado com este CPF/CNPJ.',
        });
        return;
      }

      const payload = {
        name: data.name,
        customer_type: data.customer_type,
        cpf_cnpj: cleanDoc,
        email: data.email || null,
        phone: data.phone.replace(/\D/g, ''),
        street: data.street || null,
        number: data.number || null,
        complement: data.complement || null,
        neighborhood: data.neighborhood || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code?.replace(/\D/g, '') || null,
        trading_name: data.customer_type === 'PJ' ? (data.trading_name || null) : null,
        responsible_name: data.customer_type === 'PJ' ? (data.responsible_name || null) : null,
        responsible_contact: data.customer_type === 'PJ' ? (data.responsible_contact || null) : null,
        validated: data.validated,
        validation_data: validationData as unknown as Record<string, unknown> | null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('customers')
          .update(payload as any)
          .eq('id', customer.id);

        if (error) throw error;

        toast({
          title: 'Cliente atualizado',
          description: 'As alterações foram salvas com sucesso.',
        });
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(payload as any);

        if (error) throw error;

        toast({
          title: 'Cliente criado',
          description: 'O novo cliente foi cadastrado com sucesso.',
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message?.includes('duplicate')
          ? 'Já existe um cliente com este CPF/CNPJ.'
          : 'Não foi possível salvar o cliente.',
      });
    }
  };

  const states = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  const formatCpfCnpj = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 11) {
      return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Atualize as informações do cliente.' : 'Digite o CPF ou CNPJ para validar e preencher automaticamente.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Seção de Documento e Validação */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">Identificação</h3>
                {validationStatus === 'valid' && (
                  <Badge variant="default" className="bg-primary text-primary-foreground">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Validado
                  </Badge>
                )}
                {validationStatus === 'invalid' && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Inválido
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="cpf_cnpj"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>CPF ou CNPJ *</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            placeholder="Digite apenas números"
                            {...field}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/\D/g, '').slice(0, 14);
                              field.onChange(clean);
                              setValidationStatus('idle');
                            }}
                            value={formatCpfCnpj(field.value)}
                            className="font-mono"
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={validateDocument}
                          disabled={validating || cpfCnpj.replace(/\D/g, '').length < 11}
                        >
                          {validating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <FormDescription>
                        {customerType === 'PJ' ? 'CNPJ será consultado na Receita Federal' : 'CPF será validado localmente'}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customer_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="PF">Pessoa Física</SelectItem>
                          <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Detectado automaticamente</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Dados Básicos */}
            <div className="space-y-4">
              <h3 className="font-semibold">Dados Básicos</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{customerType === 'PJ' ? 'Razão Social *' : 'Nome Completo *'}</FormLabel>
                      <FormControl>
                        <Input placeholder={customerType === 'PJ' ? 'Razão social da empresa' : 'Nome completo'} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {customerType === 'PJ' && (
                  <>
                    <FormField
                      control={form.control}
                      name="trading_name"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Nome Fantasia</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome fantasia (opcional)" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="responsible_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsável</FormLabel>
                          <FormControl>
                            <Input placeholder="Nome do responsável" {...field} />
                          </FormControl>
                          <FormDescription>Pessoa de contato na empresa</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="responsible_contact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contato do Responsável</FormLabel>
                          <FormControl>
                            <Input placeholder="Telefone ou e-mail" {...field} />
                          </FormControl>
                          <FormDescription>Telefone ou e-mail direto</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(00) 00000-0000"
                          {...field}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, '').slice(0, 11);
                            field.onChange(clean);
                          }}
                          value={formatPhone(field.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@exemplo.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-4">
              <h3 className="font-semibold">Endereço</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="zip_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00000-000"
                          {...field}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, '').slice(0, 8);
                            field.onChange(clean);
                            if (clean.length === 8) {
                              fetchAddressByCep(clean);
                            }
                          }}
                          value={field.value?.replace(/(\d{5})(\d{3})/, '$1-$2') || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Logradouro</FormLabel>
                      <FormControl>
                        <Input placeholder="Rua, Avenida, etc" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                        <Input placeholder="Apto, Bloco, etc" {...field} />
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
                        <Input placeholder="Nome do bairro" {...field} />
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
                        <Input placeholder="Nome da cidade" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {states.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Status */}
            <FormField
              control={form.control}
              name="validated"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Cliente Validado</FormLabel>
                    <FormDescription>
                      Indica se os dados foram verificados na Receita Federal/SEFAZ
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

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
