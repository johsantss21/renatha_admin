import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Printer } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeliveryReportDialogProps {
  timeSlots: string[];
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function buildAddress(c: any): string {
  const parts = [c.street, c.number, c.complement, c.neighborhood, c.city, c.state].filter(Boolean);
  if (c.zip_code) parts.push(`CEP: ${c.zip_code}`);
  return parts.join(', ') || 'Endereço não informado';
}

export function DeliveryReportDialog({ timeSlots }: DeliveryReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [tipoPedido, setTipoPedido] = useState('all');
  const [clientSearch, setClientSearch] = useState('');
  const [janelaFilter, setJanelaFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      toast({ variant: 'destructive', title: 'Selecione as datas' });
      return;
    }
    setGenerating(true);
    try {
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Fetch orders
      let orderQuery = supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .gte('delivery_date', startStr)
        .lte('delivery_date', endStr)
        .neq('payment_status', 'cancelado')
        .neq('delivery_status', 'cancelado');

      const { data: orders } = await orderQuery;

      // Fetch subscription deliveries
      let subQuery = supabase
        .from('subscription_deliveries')
        .select('*, subscription:subscriptions(*, customer:customers(*), items:subscription_items(*, product:products(*)))')
        .gte('delivery_date', startStr)
        .lte('delivery_date', endStr);

      const { data: subDeliveries } = await subQuery;

      // Build unified list
      interface ReportEntry {
        date: string;
        timeSlot: string;
        customerName: string;
        customerAddress: string;
        customerPhone: string;
        orderType: string;
        paymentMethod: string;
        items: { name: string; quantity: number; value: number }[];
        totalAmount: number;
        notes: string;
      }

      const entries: ReportEntry[] = [];

      for (const o of (orders || [])) {
        const type = 'Avulso';
        if (tipoPedido !== 'all' && tipoPedido !== 'avulso') continue;
        const slot = o.delivery_time_slot || 'Sem horário';
        if (janelaFilter !== 'all' && slot !== janelaFilter) continue;
        const c = o.customer as any;
        if (clientSearch) {
          const s = clientSearch.toLowerCase();
          if (!c?.name?.toLowerCase().includes(s) && !c?.cpf_cnpj?.includes(s)) continue;
        }
        entries.push({
          date: o.delivery_date || '',
          timeSlot: slot,
          customerName: c?.name || 'Sem nome',
          customerAddress: c ? buildAddress(c) : '',
          customerPhone: c?.phone || '',
          orderType: type,
          paymentMethod: o.payment_method === 'pix' ? 'Pix' : o.payment_method === 'cartao' || o.payment_method === 'stripe' ? 'Cartão' : o.payment_method || '-',
          items: (o.items || []).map((i: any) => ({ name: i.product?.name || 'Produto', quantity: i.quantity, value: Number(i.total_price) })),
          totalAmount: Number(o.total_amount),
          notes: o.notes || '',
        });
      }

      for (const sd of (subDeliveries || [])) {
        const sub = sd.subscription as any;
        if (!sub) continue;
        const isEmergency = sub.is_emergency === true;
        const type = isEmergency ? 'Emergencial' : 'Assinatura';
        if (tipoPedido !== 'all') {
          if (tipoPedido === 'assinatura' && isEmergency) continue;
          if (tipoPedido === 'emergencial' && !isEmergency) continue;
          if (tipoPedido === 'avulso') continue;
        }
        const slot = sub.delivery_time_slot || 'Sem horário';
        if (janelaFilter !== 'all' && slot !== janelaFilter) continue;
        const c = sub.customer as any;
        if (clientSearch) {
          const s = clientSearch.toLowerCase();
          if (!c?.name?.toLowerCase().includes(s) && !c?.cpf_cnpj?.includes(s)) continue;
        }
        entries.push({
          date: sd.delivery_date,
          timeSlot: slot,
          customerName: c?.name || 'Sem nome',
          customerAddress: c ? buildAddress(c) : '',
          customerPhone: c?.phone || '',
          orderType: type,
          paymentMethod: sub.stripe_subscription_id ? 'Cartão' : sub.pix_transaction_id ? 'Pix' : '-',
          items: (sub.items || []).map((i: any) => ({ name: i.product?.name || 'Produto', quantity: i.quantity, value: Number(i.unit_price) * i.quantity })),
          totalAmount: Number(sd.total_amount),
          notes: sd.notes || '',
        });
      }

      if (entries.length === 0) {
        toast({ variant: 'destructive', title: 'Nenhuma entrega encontrada', description: 'Ajuste os filtros.' });
        setGenerating(false);
        return;
      }

      // Sort by date then time slot
      entries.sort((a, b) => a.date.localeCompare(b.date) || a.timeSlot.localeCompare(b.timeSlot));

      // Group by date + slot
      const groups = new Map<string, ReportEntry[]>();
      for (const e of entries) {
        const key = `${e.date}|${e.timeSlot}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e);
      }

      // Generate HTML for print
      const totalPedidos = entries.length;
      const totalItens = entries.reduce((s, e) => s + e.items.reduce((si, i) => si + i.quantity, 0), 0);
      const totalValor = entries.reduce((s, e) => s + e.totalAmount, 0);

      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Entregas</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #333; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 16px; }
        .header small { color: #666; }
        .group-title { background: #f0f0f0; padding: 6px 10px; font-weight: bold; margin-top: 16px; border-left: 4px solid #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 11px; }
        th { background: #f8f8f8; font-weight: bold; }
        .items-list { margin: 0; padding-left: 16px; }
        .footer { margin-top: 24px; border-top: 2px solid #333; padding-top: 8px; font-weight: bold; }
        @media print { body { margin: 10px; } }
      </style></head><body>
      <div class="header">
        <h1>Relatório de Entregas</h1>
        <small>Gerado em: ${new Date().toLocaleString('pt-BR')} | Período: ${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}</small>
      </div>`;

      for (const [key, items] of groups) {
        const [date, slot] = key.split('|');
        const dateFormatted = date ? new Date(date + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
        html += `<div class="group-title">${dateFormatted} — ${slot}</div>`;
        html += `<table><thead><tr><th>Cliente</th><th>Endereço</th><th>Telefone</th><th>Tipo</th><th>Pagamento</th><th>Itens</th><th>Valor</th><th>Obs</th></tr></thead><tbody>`;
        for (const e of items) {
          const itemsHtml = e.items.map(i => `${i.quantity}x ${i.name}`).join('<br>');
          html += `<tr>
            <td>${e.customerName}</td>
            <td>${e.customerAddress}</td>
            <td>${e.customerPhone}</td>
            <td>${e.orderType}</td>
            <td>${e.paymentMethod}</td>
            <td>${itemsHtml}</td>
            <td>${formatCurrency(e.totalAmount)}</td>
            <td>${e.notes}</td>
          </tr>`;
        }
        html += `</tbody></table>`;
      }

      html += `<div class="footer">
        Total de pedidos: ${totalPedidos} | Total de itens: ${totalItens} | Total: ${formatCurrency(totalValor)}
      </div></body></html>`;

      // Open print window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }

      toast({ title: 'Relatório gerado com sucesso' });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Erro ao gerar relatório' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimir Relatório de Entregas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Relatório de Entregas</DialogTitle>
          <DialogDescription>Selecione os filtros para gerar o relatório imprimível.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Selecionar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Pedido</Label>
            <Select value={tipoPedido} onValueChange={setTipoPedido}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="avulso">Avulso</SelectItem>
                <SelectItem value="assinatura">Assinatura</SelectItem>
                <SelectItem value="emergencial">Emergencial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cliente (nome, CPF ou CNPJ)</Label>
            <Input
              placeholder="Buscar..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Janela de Entrega</Label>
            <Select value={janelaFilter} onValueChange={setJanelaFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {timeSlots.map((slot) => (
                  <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2">
            <Printer className="h-4 w-4" />
            {generating ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
