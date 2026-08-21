import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const WEEKDAYS = [
  ['MONDAY', 'Seg'],
  ['TUESDAY', 'Ter'],
  ['WEDNESDAY', 'Qua'],
  ['THURSDAY', 'Qui'],
  ['FRIDAY', 'Sex'],
  ['SATURDAY', 'Sáb'],
  ['SUNDAY', 'Dom'],
] as const;

function timeValue(minute: number | null | undefined) {
  if (minute == null) return '';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export interface OfferScheduleInitialValue {
  startsOn?: string | null;
  endsOnExclusive?: string | null;
  weekdays?: string[];
  startMinute?: number | null;
  endMinuteExclusive?: number | null;
}

export function OfferScheduleFields({
  prefix,
  initialValue,
}: {
  prefix: string;
  initialValue?: OfferScheduleInitialValue;
}) {
  const selected = new Set(initialValue?.weekdays ?? []);
  return (
    <fieldset className="border-border space-y-4 border-t pt-6">
      <legend className="text-text-primary px-0 text-base font-semibold">Disponibilidade</legend>
      <p className="text-text-secondary text-sm">
        Datas seguem o calendário local da loja. Sem seleção, a oferta vale todos os dias.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-starts-on`}>Data inicial</Label>
          <Input
            id={`${prefix}-starts-on`}
            name="startsOn"
            type="date"
            defaultValue={initialValue?.startsOn ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-ends-on`}>Data final</Label>
          <Input
            id={`${prefix}-ends-on`}
            name="endsOnExclusive"
            type="date"
            defaultValue={initialValue?.endsOnExclusive ?? ''}
          />
          <p className="text-text-secondary text-sm">A oferta encerra no início desta data.</p>
        </div>
      </div>
      <div>
        <span className="text-text-primary text-sm font-medium">Dias da semana</span>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAYS.map(([value, label]) => (
            <label
              key={value}
              className="border-border has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700 has-focus-visible:ring-brand-500 flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-offset-2"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={value}
                defaultChecked={selected.has(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-start-time`}>Horário inicial</Label>
          <Input
            id={`${prefix}-start-time`}
            name="startTime"
            type="time"
            defaultValue={timeValue(initialValue?.startMinute)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-end-time`}>Horário final</Label>
          <Input
            id={`${prefix}-end-time`}
            name="endTimeExclusive"
            type="time"
            defaultValue={timeValue(initialValue?.endMinuteExclusive)}
          />
          <p className="text-text-secondary text-sm">Pode atravessar a meia-noite.</p>
        </div>
      </div>
    </fieldset>
  );
}
