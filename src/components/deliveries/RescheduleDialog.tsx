import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string, timeSlot: string) => void;
  timeSlots: string[];
  loading?: boolean;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  onConfirm,
  timeSlots,
  loading,
}: RescheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const handleConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    onConfirm(format(selectedDate, 'yyyy-MM-dd'), selectedSlot);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reagendar Entrega</DialogTitle>
          <DialogDescription>Selecione a nova data e janela de entrega.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            locale={ptBR}
            disabled={(date) => date < new Date()}
            className="rounded-md border mx-auto"
          />

          <Select value={selectedSlot} onValueChange={setSelectedSlot}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a janela de horário" />
            </SelectTrigger>
            <SelectContent>
              {timeSlots.map((slot) => (
                <SelectItem key={slot} value={slot}>
                  {slot === 'manha' ? 'Manhã' : slot === 'tarde' ? 'Tarde' : slot}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedDate || !selectedSlot || loading}>
            {loading ? 'Salvando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
