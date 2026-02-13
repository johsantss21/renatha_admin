import { MapPin, Package, Clock, User, FileText, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';
import { DeliveryStatus } from '@/types/database';

export interface DeliveryItem {
  id: string;
  sourceType: 'order' | 'subscription_delivery';
  sourceId: string;
  orderType: 'avulso' | 'assinatura' | 'emergencial';
  customerName: string;
  customerAddress: string;
  products: { name: string; quantity: number }[];
  totalQuantity: number;
  totalAmount: number;
  timeSlot: string;
  deliveryStatus: DeliveryStatus;
  notes: string | null;
}

interface DeliveryCardProps {
  delivery: DeliveryItem;
  onMarkDelivered: (delivery: DeliveryItem) => void;
  onMarkCancelled: (delivery: DeliveryItem) => void;
  onReschedule: (delivery: DeliveryItem) => void;
  onUpdateNotes: (delivery: DeliveryItem, notes: string) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const statusConfig: Record<DeliveryStatus, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  aguardando: { variant: 'secondary', label: 'Agendada' },
  em_rota: { variant: 'outline', label: 'Em Rota' },
  entregue: { variant: 'default', label: 'Entregue' },
  cancelado: { variant: 'destructive', label: 'Cancelada' },
};

const typeConfig: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string }> = {
  avulso: { variant: 'outline', label: 'Avulso' },
  assinatura: { variant: 'secondary', label: 'Assinatura' },
  emergencial: { variant: 'default', label: 'Emergencial' },
};

export function DeliveryCard({
  delivery,
  onMarkDelivered,
  onMarkCancelled,
  onReschedule,
  onUpdateNotes,
}: DeliveryCardProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(delivery.notes || '');
  const status = statusConfig[delivery.deliveryStatus];
  const type = typeConfig[delivery.orderType];
  const isFinished = delivery.deliveryStatus === 'entregue' || delivery.deliveryStatus === 'cancelado';

  return (
    <Card className={isFinished ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {delivery.customerName}
            </CardTitle>
            <Badge variant={type.variant}>{type.label}</Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <div className="text-right text-sm font-semibold whitespace-nowrap">
            {formatCurrency(delivery.totalAmount)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{delivery.customerAddress || 'Endereço não informado'}</span>
        </div>

        <div className="flex items-start gap-2 text-sm">
          <Package className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            {delivery.products.map((p, i) => (
              <div key={i}>
                {p.quantity}x {p.name}
              </div>
            ))}
            <span className="text-muted-foreground text-xs">
              Total: {delivery.totalQuantity} item(ns)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{delivery.timeSlot}</span>
        </div>

        {/* Notes */}
        <div className="flex items-start gap-2 text-sm">
          <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          {editingNotes ? (
            <div className="flex-1 space-y-2">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={2}
                placeholder="Observações..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingNotes(false);
                    setNotesValue(delivery.notes || '');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    onUpdateNotes(delivery, notesValue);
                    setEditingNotes(false);
                  }}
                >
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <button
              className="text-left hover:text-foreground transition-colors"
              onClick={() => setEditingNotes(true)}
            >
              {delivery.notes || 'Adicionar observação...'}
            </button>
          )}
        </div>

        {/* Actions */}
        {!isFinished && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" onClick={() => onMarkDelivered(delivery)}>
              Marcar Entregue
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onMarkCancelled(delivery)}>
              Cancelar
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onReschedule(delivery)}>
              <CalendarClock className="h-3.5 w-3.5" />
              Reagendar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
