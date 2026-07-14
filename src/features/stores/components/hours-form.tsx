'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateHoursAction } from '@/features/stores/actions';

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
      return existing ?? { dayOfWeek: day.value, openTime: '11:00', closeTime: '23:00', isActive: false };
    }),
  );
  const [saving, setSaving] = useState(false);

  function updateHour(index: number, field: keyof HourEntry, value: string | boolean) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateHoursAction({ hours });
      if (result.success) {
        toast.success('Horários atualizados!');
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {hours.map((hour, index) => {
        const day = DAYS.find((d) => d.value === hour.dayOfWeek);
        return (
          <div key={hour.dayOfWeek} className="flex items-center gap-4 rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={hour.isActive}
                onCheckedChange={(checked) => updateHour(index, 'isActive', checked)}
              />
              <Label className="w-32 text-sm font-medium">{day?.label}</Label>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="time"
                value={hour.openTime}
                onChange={(e) => updateHour(index, 'openTime', e.target.value)}
                disabled={!hour.isActive}
                className="w-28"
              />
              <span className="text-text-tertiary">até</span>
              <Input
                type="time"
                value={hour.closeTime}
                onChange={(e) => updateHour(index, 'closeTime', e.target.value)}
                disabled={!hour.isActive}
                className="w-28"
              />
            </div>
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar horários'}
        </Button>
      </div>
    </div>
  );
}
