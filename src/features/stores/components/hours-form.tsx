'use client';

import { CalendarDays, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  removeScheduleExceptionAction,
  saveScheduleExceptionAction,
  updateHoursAction,
} from '@/features/stores/actions';
import { FormMessage } from '@/components/shared/form-message';
import { APPROVED_STORE_TIME_ZONES } from '@/schemas/store';

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
  storeId: string;
  expectedConfigurationVersion: number;
  timeZone: string;
  canEditTimeZone: boolean;
  hours: HourEntry[];
  exceptions: {
    id: string;
    date: string;
    type: 'CLOSED' | 'CUSTOM_HOURS';
    openTime: string | null;
    closeTime: string | null;
    reason: string | null;
  }[];
}

const TIME_ZONE_LABELS: Record<(typeof APPROVED_STORE_TIME_ZONES)[number], string> = {
  'America/Noronha': 'Fernando de Noronha',
  'America/Belem': 'Belém',
  'America/Fortaleza': 'Fortaleza',
  'America/Recife': 'Recife',
  'America/Maceio': 'Maceió',
  'America/Bahia': 'Salvador',
  'America/Sao_Paulo': 'São Paulo',
  'America/Campo_Grande': 'Campo Grande',
  'America/Cuiaba': 'Cuiabá',
  'America/Manaus': 'Manaus',
  'America/Boa_Vista': 'Boa Vista',
  'America/Porto_Velho': 'Porto Velho',
  'America/Rio_Branco': 'Rio Branco',
  'America/Eirunepe': 'Eirunepé',
};

export function HoursForm({
  storeId,
  expectedConfigurationVersion,
  timeZone: initialTimeZone,
  canEditTimeZone,
  hours: initial,
  exceptions,
}: HoursFormProps) {
  const router = useRouter();
  const [configurationVersion, setConfigurationVersion] = useState(expectedConfigurationVersion);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [hours, setHours] = useState<HourEntry[]>(() =>
    DAYS.map((day) => {
      const existing = initial.find((h) => h.dayOfWeek === day.value);
      return (
        existing ?? { dayOfWeek: day.value, openTime: '11:00', closeTime: '23:00', isActive: false }
      );
    }),
  );
  const [saving, setSaving] = useState(false);
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionType, setExceptionType] = useState<'CLOSED' | 'CUSTOM_HOURS'>('CLOSED');
  const [exceptionOpenTime, setExceptionOpenTime] = useState('11:00');
  const [exceptionCloseTime, setExceptionCloseTime] = useState('23:00');
  const [exceptionReason, setExceptionReason] = useState('');
  const [exceptionPending, setExceptionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateHour(index: number, field: keyof HourEntry, value: string | boolean) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await updateHoursAction(storeId, configurationVersion, { timeZone, hours });
      if (result.success) {
        setConfigurationVersion(result.data.configurationVersion);
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

  async function handleSaveException() {
    setExceptionPending(true);
    setError(null);
    try {
      const result = await saveScheduleExceptionAction(storeId, configurationVersion, {
        date: exceptionDate,
        type: exceptionType,
        openTime: exceptionType === 'CUSTOM_HOURS' ? exceptionOpenTime : undefined,
        closeTime: exceptionType === 'CUSTOM_HOURS' ? exceptionCloseTime : undefined,
        reason: exceptionReason,
      });
      if (result.success) {
        setConfigurationVersion(result.data.configurationVersion);
        toast.success('Exceção de calendário salva.');
        router.refresh();
      } else {
        setError(result.error.message);
        toast.error(result.error.message);
      }
    } finally {
      setExceptionPending(false);
    }
  }

  async function handleRemoveException(exceptionId: string) {
    setExceptionPending(true);
    setError(null);
    try {
      const result = await removeScheduleExceptionAction(
        storeId,
        configurationVersion,
        exceptionId,
      );
      if (result.success) {
        setConfigurationVersion(result.data.configurationVersion);
        toast.success('Exceção removida.');
        router.refresh();
      } else {
        setError(result.error.message);
        toast.error(result.error.message);
      }
    } finally {
      setExceptionPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormMessage message={error} />
      <div className="space-y-2">
        <Label htmlFor="store-time-zone">Fuso horário da loja</Label>
        <select
          id="store-time-zone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          disabled={!canEditTimeZone || saving}
          className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 disabled:bg-surface-secondary disabled:text-text-muted min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {APPROVED_STORE_TIME_ZONES.map((value) => (
            <option key={value} value={value}>
              {TIME_ZONE_LABELS[value]} — {value}
            </option>
          ))}
        </select>
        <p className="text-text-secondary text-sm">
          Todos os horários e exceções abaixo usam este fuso.
          {!canEditTimeZone && ' Somente o proprietário pode alterá-lo.'}
        </p>
      </div>
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

      <section className="border-border space-y-4 border-t pt-6" aria-labelledby="exceptions-title">
        <div>
          <h2 id="exceptions-title" className="text-text-primary text-lg font-semibold">
            Exceções e feriados
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Substitua o horário semanal em uma data específica ou marque um fechamento especial.
          </p>
        </div>

        {exceptions.length > 0 ? (
          <ul className="border-border divide-border divide-y rounded-lg border">
            {exceptions.map((exception) => (
              <li key={exception.id} className="flex items-start gap-3 p-3">
                <CalendarDays
                  className="text-text-secondary mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary text-sm font-medium">
                    {new Intl.DateTimeFormat('pt-BR', {
                      timeZone: 'UTC',
                      dateStyle: 'long',
                    }).format(new Date(`${exception.date}T00:00:00.000Z`))}
                  </p>
                  <p className="text-text-secondary text-sm">
                    {exception.type === 'CLOSED'
                      ? 'Fechada o dia inteiro'
                      : `${exception.openTime}–${exception.closeTime}`}
                    {exception.reason ? ` · ${exception.reason}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={exceptionPending}
                  onClick={() => handleRemoveException(exception.id)}
                  aria-label={`Remover exceção de ${exception.date}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-secondary text-sm" role="status">
            Nenhuma exceção futura cadastrada. O horário semanal será usado normalmente.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="exception-date">Data</Label>
            <Input
              id="exception-date"
              type="date"
              value={exceptionDate}
              onChange={(event) => setExceptionDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exception-type">Tipo</Label>
            <select
              id="exception-type"
              value={exceptionType}
              onChange={(event) =>
                setExceptionType(event.target.value as 'CLOSED' | 'CUSTOM_HOURS')
              }
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value="CLOSED">Fechada o dia inteiro</option>
              <option value="CUSTOM_HOURS">Horário especial</option>
            </select>
          </div>
          {exceptionType === 'CUSTOM_HOURS' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="exception-open">Abertura</Label>
                <Input
                  id="exception-open"
                  type="time"
                  value={exceptionOpenTime}
                  onChange={(event) => setExceptionOpenTime(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exception-close">Fechamento</Label>
                <Input
                  id="exception-close"
                  type="time"
                  value={exceptionCloseTime}
                  onChange={(event) => setExceptionCloseTime(event.target.value)}
                />
              </div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exception-reason">Motivo (opcional)</Label>
            <Input
              id="exception-reason"
              value={exceptionReason}
              maxLength={200}
              onChange={(event) => setExceptionReason(event.target.value)}
              placeholder="Ex.: feriado municipal"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveException}
            disabled={exceptionPending || !exceptionDate}
            aria-busy={exceptionPending}
          >
            {exceptionPending ? 'Salvando…' : 'Adicionar exceção'}
          </Button>
        </div>
      </section>
    </div>
  );
}
