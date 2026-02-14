import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings as SettingsIcon, Loader2, Save, Clock, Calendar, Package, Users, Zap, Trash2, Plus, Landmark, CreditCard, Webhook, FileText, Layers, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { PixIntegrationSettings } from '@/components/settings/PixIntegrationSettings';
import { StripeIntegrationSettings } from '@/components/settings/StripeIntegrationSettings';
import { N8nIntegrationSettings } from '@/components/settings/N8nIntegrationSettings';
import { SefazIntegrationSettings } from '@/components/settings/SefazIntegrationSettings';
import { OtherIntegrationSettings } from '@/components/settings/OtherIntegrationSettings';
import { McpIntegrationSettings } from '@/components/settings/McpIntegrationSettings';

const weekdayOptions = [
  { value: 'domingo', label: 'Domingo' },
  { value: 'segunda', label: 'Segunda' },
  { value: 'terca', label: 'Terça' },
  { value: 'quarta', label: 'Quarta' },
  { value: 'quinta', label: 'Quinta' },
  { value: 'sexta', label: 'Sexta' },
  { value: 'sabado', label: 'Sábado' },
];

const frequencyOptions = [
  { value: 'diaria', label: 'Diária' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' },
];

const settingsSchema = z.object({
  min_qtd_kit_preco: z.number().min(1, 'Deve ser pelo menos 1'),
  hora_limite_entrega_dia: z.string(),
  janelas_horario_entregas_avulsas: z.string(),
  min_itens_assinatura_pf: z.number().min(1, 'Deve ser pelo menos 1'),
  min_itens_assinatura_pj: z.number().min(1, 'Deve ser pelo menos 1'),
  janelas_horario_entregas_assinaturas: z.string(),
  recorrencia_pj: z.array(z.string()),
  recorrencia_pf: z.array(z.string()),
  dias_funcionamento: z.array(z.string()),
  hora_abertura: z.string(),
  hora_fechamento: z.string(),
  entregas_diaria: z.number().min(1),
  entregas_semanal: z.number().min(1),
  entregas_quinzenal: z.number().min(1),
  entregas_mensal: z.number().min(1),
  habilitar_emergencial_pj: z.boolean(),
  feriados: z.array(z.string()),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newFeriado, setNewFeriado] = useState('');

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      min_qtd_kit_preco: 3,
      hora_limite_entrega_dia: '12:00',
      janelas_horario_entregas_avulsas: '08:00-09:00, 09:00-10:00, 10:00-11:00, 11:00-12:00, 14:00-15:00, 15:00-16:00, 16:00-17:00',
      min_itens_assinatura_pf: 1,
      min_itens_assinatura_pj: 1,
      janelas_horario_entregas_assinaturas: '08:00-09:00, 09:00-10:00, 10:00-11:00, 11:00-12:00, 14:00-15:00, 15:00-16:00, 16:00-17:00',
      recorrencia_pj: ['diaria', 'semanal', 'quinzenal', 'mensal'],
      recorrencia_pf: ['semanal', 'quinzenal', 'mensal'],
      dias_funcionamento: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      hora_abertura: '08:00',
      hora_fechamento: '18:00',
      entregas_diaria: 20,
      entregas_semanal: 4,
      entregas_quinzenal: 2,
      entregas_mensal: 1,
      habilitar_emergencial_pj: false,
      feriados: [],
    },
  });

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('system_settings').select('*');
      if (error) throw error;

      const settingsMap = new Map(data?.map(s => [s.key, s.value]));
      const getValue = (key: string, defaultValue: any) => {
        const val = settingsMap.get(key);
        if (val === undefined || val === null) return defaultValue;
        if (typeof val === 'string') { try { return JSON.parse(val); } catch { return val; } }
        return val;
      };

      const entregasPorRecorrencia = getValue('entregas_por_recorrencia', { diaria: 20, semanal: 4, quinzenal: 2, mensal: 1 });
      const oldMinItens = getValue('min_itens_assinatura', 1);

      form.reset({
        min_qtd_kit_preco: getValue('min_qtd_kit_preco', 3),
        hora_limite_entrega_dia: getValue('hora_limite_entrega_dia', '12:00'),
        janelas_horario_entregas_avulsas: Array.isArray(getValue('janelas_horario_entregas_avulsas', []))
          ? getValue('janelas_horario_entregas_avulsas', []).join(', ')
          : getValue('janelas_horario_entregas_avulsas', ''),
        min_itens_assinatura_pf: getValue('min_itens_assinatura_pf', oldMinItens),
        min_itens_assinatura_pj: getValue('min_itens_assinatura_pj', oldMinItens),
        janelas_horario_entregas_assinaturas: Array.isArray(getValue('janelas_horario_entregas_assinaturas', []))
          ? getValue('janelas_horario_entregas_assinaturas', []).join(', ')
          : getValue('janelas_horario_entregas_assinaturas', ''),
        recorrencia_pj: getValue('recorrencia_pj', ['diaria', 'semanal', 'quinzenal', 'mensal']),
        recorrencia_pf: getValue('recorrencia_pf', ['semanal', 'quinzenal', 'mensal']),
        dias_funcionamento: getValue('dias_funcionamento', ['segunda', 'terca', 'quarta', 'quinta', 'sexta']),
        hora_abertura: getValue('hora_abertura', '08:00'),
        hora_fechamento: getValue('hora_fechamento', '18:00'),
        entregas_diaria: entregasPorRecorrencia.diaria || 20,
        entregas_semanal: entregasPorRecorrencia.semanal || 4,
        entregas_quinzenal: entregasPorRecorrencia.quinzenal || 2,
        entregas_mensal: entregasPorRecorrencia.mensal || 1,
        habilitar_emergencial_pj: getValue('habilitar_emergencial_pj', false),
        feriados: getValue('feriados', []),
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar as configurações.' });
    } finally { setLoading(false); }
  };

  const onSubmit = async (data: SettingsFormData) => {
    setSaving(true);
    try {
      const janelasAvulsas = data.janelas_horario_entregas_avulsas.split(',').map(s => s.trim()).filter(Boolean);
      const janelasAssinaturas = data.janelas_horario_entregas_assinaturas.split(',').map(s => s.trim()).filter(Boolean);

      const settingsToSave = [
        { key: 'min_qtd_kit_preco', value: data.min_qtd_kit_preco, description: 'Quantidade mínima de itens para aplicar preço de kit' },
        { key: 'hora_limite_entrega_dia', value: data.hora_limite_entrega_dia, description: 'Horário limite para agendamento de entrega no mesmo dia' },
        { key: 'janelas_horario_entregas_avulsas', value: janelasAvulsas, description: 'Janelas de horário para entregas avulsas' },
        { key: 'min_itens_assinatura_pf', value: data.min_itens_assinatura_pf, description: 'Quantidade mínima de itens para assinatura PF' },
        { key: 'min_itens_assinatura_pj', value: data.min_itens_assinatura_pj, description: 'Quantidade mínima de itens para assinatura PJ' },
        { key: 'janelas_horario_entregas_assinaturas', value: janelasAssinaturas, description: 'Janelas de horário para entregas de assinaturas' },
        { key: 'recorrencia_pj', value: data.recorrencia_pj, description: 'Frequências de recorrência permitidas para PJ' },
        { key: 'recorrencia_pf', value: data.recorrencia_pf, description: 'Frequências de recorrência permitidas para PF' },
        { key: 'dias_funcionamento', value: data.dias_funcionamento, description: 'Dias da semana com operação ativa' },
        { key: 'hora_abertura', value: data.hora_abertura, description: 'Horário de abertura da empresa' },
        { key: 'hora_fechamento', value: data.hora_fechamento, description: 'Horário de fechamento da empresa' },
        { key: 'entregas_por_recorrencia', value: { diaria: data.entregas_diaria, semanal: data.entregas_semanal, quinzenal: data.entregas_quinzenal, mensal: data.entregas_mensal }, description: 'Número de entregas mensais por tipo de recorrência' },
        { key: 'habilitar_emergencial_pj', value: data.habilitar_emergencial_pj, description: 'Habilitar pedido emergencial não recorrente para clientes PJ' },
        { key: 'feriados', value: data.feriados, description: 'Lista de feriados (formato YYYY-MM-DD)' },
      ];

      for (const setting of settingsToSave) {
        const { error } = await supabase.from('system_settings').upsert({ key: setting.key, value: setting.value as any, description: setting.description }, { onConflict: 'key' });
        if (error) throw error;
      }

      toast({ title: 'Configurações salvas', description: 'As configurações foram atualizadas com sucesso.' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível salvar as configurações.' });
    } finally { setSaving(false); }
  };

  const addFeriado = () => {
    if (!newFeriado) return;
    const current = form.getValues('feriados');
    if (!current.includes(newFeriado)) form.setValue('feriados', [...current, newFeriado].sort());
    setNewFeriado('');
  };

  const removeFeriado = (date: string) => {
    form.setValue('feriados', form.getValues('feriados').filter(d => d !== date));
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurações do Sistema</h1>
          <p className="text-muted-foreground mt-1">Parâmetros, regras de negócio e integrações</p>
        </div>

        <Tabs defaultValue="regras" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="regras" className="gap-1.5">
              <SettingsIcon className="h-4 w-4" />
              Regras de Negócio
            </TabsTrigger>
            <TabsTrigger value="pix" className="gap-1.5">
              <Landmark className="h-4 w-4" />
              Pix / Efí
            </TabsTrigger>
            <TabsTrigger value="stripe" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              Stripe
            </TabsTrigger>
            <TabsTrigger value="n8n" className="gap-1.5">
              <Webhook className="h-4 w-4" />
              n8n
            </TabsTrigger>
            <TabsTrigger value="sefaz" className="gap-1.5">
              <FileText className="h-4 w-4" />
              SEFAZ / Receita
            </TabsTrigger>
            <TabsTrigger value="outras" className="gap-1.5">
              <Layers className="h-4 w-4" />
              Outras
            </TabsTrigger>
            <TabsTrigger value="mcp" className="gap-1.5">
              <Network className="h-4 w-4" />
              MCP
            </TabsTrigger>
          </TabsList>

          {/* === REGRAS DE NEGÓCIO === */}
          <TabsContent value="regras">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Horários de Funcionamento */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Horários de Funcionamento</CardTitle>
                    <CardDescription>Configure os dias e horários de operação da empresa</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField control={form.control} name="dias_funcionamento" render={() => (
                      <FormItem>
                        <FormLabel>Dias de Funcionamento</FormLabel>
                        <div className="flex flex-wrap gap-2">
                          {weekdayOptions.map((option) => (
                            <FormField key={option.value} control={form.control} name="dias_funcionamento" render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox checked={field.value?.includes(option.value)} onCheckedChange={(checked) => {
                                    field.onChange(checked ? [...field.value, option.value] : field.value?.filter((v) => v !== option.value));
                                  }} />
                                </FormControl>
                                <FormLabel className="text-sm font-normal">{option.label}</FormLabel>
                              </FormItem>
                            )} />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="hora_abertura" render={({ field }) => (
                        <FormItem><FormLabel>Horário de Abertura</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="hora_fechamento" render={({ field }) => (
                        <FormItem><FormLabel>Horário de Fechamento</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                  </CardContent>
                </Card>

                {/* Feriados */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Feriados</CardTitle>
                    <CardDescription>Datas em que não há entrega.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input type="date" value={newFeriado} onChange={(e) => setNewFeriado(e.target.value)} className="max-w-xs" />
                      <Button type="button" variant="outline" size="sm" onClick={addFeriado}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {form.watch('feriados').map((date) => (
                        <Badge key={date} variant="secondary" className="gap-1">
                          {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          <button type="button" onClick={() => removeFeriado(date)} className="ml-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                      {form.watch('feriados').length === 0 && <p className="text-sm text-muted-foreground">Nenhum feriado cadastrado.</p>}
                    </div>
                  </CardContent>
                </Card>

                {/* Pedidos Avulsos */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Pedidos Avulsos</CardTitle>
                    <CardDescription>Regras de preço dinâmico e agendamento para pedidos avulsos</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="min_qtd_kit_preco" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantidade Mínima para Preço de Kit</FormLabel>
                          <FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl>
                          <FormDescription>A partir desta quantidade, o preço de kit será aplicado</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="hora_limite_entrega_dia" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Horário Limite para Entrega no Mesmo Dia</FormLabel>
                          <FormControl><Input type="time" {...field} /></FormControl>
                          <FormDescription>Pedidos com pagamento confirmado até este horário são entregues no mesmo dia útil</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="janelas_horario_entregas_avulsas" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Janelas de Horário para Entregas Avulsas</FormLabel>
                        <FormControl><Input placeholder="08:00-09:00, 09:00-10:00" {...field} /></FormControl>
                        <FormDescription>Separe as janelas por vírgula</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                {/* Assinaturas */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Assinaturas</CardTitle>
                    <CardDescription>Regras de recorrência e entregas para assinaturas</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="min_itens_assinatura_pf" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mínimo de Itens - PF</FormLabel>
                          <FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl>
                          <FormDescription>Número mínimo de itens para assinatura PF</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="min_itens_assinatura_pj" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mínimo de Itens - PJ</FormLabel>
                          <FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl>
                          <FormDescription>Número mínimo de itens para assinatura PJ (também para emergencial)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="janelas_horario_entregas_assinaturas" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Janelas de Horário para Entregas de Assinaturas</FormLabel>
                        <FormControl><Input placeholder="08:00-09:00, 09:00-10:00" {...field} /></FormControl>
                        <FormDescription>Separe as janelas por vírgula</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField control={form.control} name="recorrencia_pj" render={() => (
                        <FormItem>
                          <FormLabel>Recorrências PJ</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {frequencyOptions.map((option) => (
                              <FormField key={option.value} control={form.control} name="recorrencia_pj" render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox checked={field.value?.includes(option.value)} onCheckedChange={(checked) => {
                                      field.onChange(checked ? [...field.value, option.value] : field.value?.filter((v) => v !== option.value));
                                    }} />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal">{option.label}</FormLabel>
                                </FormItem>
                              )} />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="recorrencia_pf" render={() => (
                        <FormItem>
                          <FormLabel>Recorrências PF</FormLabel>
                          <div className="flex flex-wrap gap-2">
                            {frequencyOptions.map((option) => (
                              <FormField key={option.value} control={form.control} name="recorrencia_pf" render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox checked={field.value?.includes(option.value)} onCheckedChange={(checked) => {
                                      field.onChange(checked ? [...field.value, option.value] : field.value?.filter((v) => v !== option.value));
                                    }} />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal">{option.label}</FormLabel>
                                </FormItem>
                              )} />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(['entregas_diaria', 'entregas_semanal', 'entregas_quinzenal', 'entregas_mensal'] as const).map(key => (
                        <FormField key={key} control={form.control} name={key} render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entregas {key.replace('entregas_', '').charAt(0).toUpperCase() + key.replace('entregas_', '').slice(1)}</FormLabel>
                            <FormControl><Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} /></FormControl>
                            <FormDescription className="text-xs">por mês</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Emergencial PJ */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" />Pedido Emergencial PJ</CardTitle>
                    <CardDescription>Permite que clientes PJ façam pedidos emergenciais não recorrentes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField control={form.control} name="habilitar_emergencial_pj" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Habilitar Pedido Emergencial</FormLabel>
                          <FormDescription>Quando ativo, clientes PJ podem criar pedidos emergenciais com mínimo de {form.watch('min_itens_assinatura_pj')} item(ns).</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving} size="lg">
                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : <><Save className="mr-2 h-4 w-4" />Salvar Configurações</>}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          {/* === PIX / EFÍ === */}
          <TabsContent value="pix">
            <PixIntegrationSettings />
          </TabsContent>

          {/* === STRIPE === */}
          <TabsContent value="stripe">
            <StripeIntegrationSettings />
          </TabsContent>

          {/* === N8N === */}
          <TabsContent value="n8n">
            <N8nIntegrationSettings />
          </TabsContent>

          {/* === SEFAZ === */}
          <TabsContent value="sefaz">
            <SefazIntegrationSettings />
          </TabsContent>

          {/* === OUTRAS === */}
          <TabsContent value="outras">
            <OtherIntegrationSettings />
          </TabsContent>

          {/* === MCP === */}
          <TabsContent value="mcp">
            <McpIntegrationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
