'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateHoursAction } from '@/features/stores/actions';
import { FormMessage } from '@/components/shared/form-message';

const DAYS = [
  { value: 'MONDAY', label: 'Segunda-feira' },
  { value: 'TUESDAY', label: 'Terça-feira' },
  { value: 'WEDNESDAY', label: 'Quarta-feira' },
  { value: 'THURSDAY', label: 'Quinta-feira' },
  { value: 'FRIDAY', label: 'Sexta-feira' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
] as const;

interface HourEntry {
  dayOfWeek: string;
  openTime: string;
  closeTime: string;
  isActive: boolean;
}

interface HoursFormProps {
  hours: HourEntry[];
}

export function HoursForm({ hours: initial }: HoursFormProps) {
  const router = useRouter();
  const [hours, setHours] = useState<HourEntry[]>(() =>
    DAYS.map((day) => {
      const existing = initial.find((h) => h.dayOfWeek === day.value);
      return (
        existing ?? { dayOfWeek: day.value, openTime: '11:00', closeTime: '23:00', isActive: false }
      );
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateHour(index: number, field: keyof HourEntry, value: string | boolean) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateHoursAction({ hours });
      if (result.success) {
        toast.success('Horários atualizados!');
        router.refresh();
      } else {
        setError(result.error.message);
        toast.error(result.error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormMessage message={error} />
      <div className="border-border overflow-hidden rounded-lg border">
        {hours.map((hour, index) => {
          const day = DAYS.find((d) => d.value === hour.dayOfWeek);
          const dayId = hour.dayOfWeek.toLowerCase();
          return (
            <fieldset
              key={hour.dayOfWeek}
              className={`grid gap-2 p-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center ${
                index > 0 ? 'border-border border-t' : ''
              }`}
            >
              <legend className="sr-only">Horários de {day?.label}</legend>
              <div className="flex min-h-11 items-center gap-2">
                <Switch
                  id={`${dayId}-active`}
                  checked={hour.isActive}
                  onCheckedChange={(checked) => updateHour(index, 'isActive', checked)}
                />
                <Label htmlFor={`${dayId}-active`} className="text-sm font-medium">
                  {day?.label}
                </Label>
                {!hour.isActive && (
                  <span className="text-text-secondary ml-auto text-sm sm:hidden">Fechado</span>
                )}
              </div>
              {hour.isActive ? (
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${dayId}-open`} className="sr-only text-xs sm:not-sr-only">
                      Abertura
                    </Label>
                    <Input
                      id={`${dayId}-open`}
                      type="time"
                      value={hour.openTime}
                      onChange={(e) => updateHour(index, 'openTime', e.target.value)}
                      aria-label={`Abertura de ${day?.label}`}
                    />
                  </div>
                  <span className="text-text-secondary pb-3 text-sm" aria-hidden="true">
                    até
                  </span>
                  <div className="space-y-1">
                    <Label htmlFor={`${dayId}-close`} className="sr-only text-xs sm:not-sr-only">
                      Fechamento
                    </Label>
                    <Input
                      id={`${dayId}-close`}
                      type="time"
                      value={hour.closeTime}
                      onChange={(e) => updateHour(index, 'closeTime', e.target.value)}
                      aria-label={`Fechamento de ${day?.label}`}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-text-secondary hidden text-sm sm:block">Fechado</p>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
          {saving ? 'Salvando…' : 'Salvar horários'}
        </Button>
      </div>
    </div>
  );
}
