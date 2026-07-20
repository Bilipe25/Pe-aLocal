'use client';

import { Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updatePixConfigAction } from '@/features/stores/actions';
import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { Button } from '@/components/ui/button';
import { useStoreForm } from '@/features/stores/use-store-form';
import { useState } from 'react';

const PIX_KEY_TYPES = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'RANDOM', label: 'Chave Aleatória' },
];

interface PixFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  settings: {
    pixKeyType: string | null;
    pixKey: string | null;
    pixKeyMasked: string;
    pixRecipient: string | null;
    pixBank: string | null;
    pixInstructions: string | null;
  } | null;
}

export function PixForm({
  storeId,
  expectedConfigurationVersion,
  settings,
  readOnly = false,
}: PixFormProps) {
  const [revealed, setRevealed] = useState(false);
  const {
    formRef,
    configurationVersion,
    formError,
    fieldErrors,
    isDirty,
    markDirty,
    handleResult,
    restore,
  } = useStoreForm(expectedConfigurationVersion);

  async function handleSubmit(formData: FormData) {
    const result = await updatePixConfigAction(storeId, configurationVersion, formData);
    handleResult(result, 'Configuração de Pix atualizada!');
  }

  async function copyPixKey() {
    const field = formRef.current?.elements.namedItem('pixKey');
    const value = field instanceof HTMLInputElement ? field.value : '';
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success('Chave Pix copiada.');
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      onChange={markDirty}
      onSubmit={(event) => {
        if (isDirty && !window.confirm('Confirmar a alteração dos dados Pix desta unidade?')) {
          event.preventDefault();
        }
      }}
      className="space-y-4"
    >
      <FormMessage message={formError} fieldErrors={fieldErrors} />
      <div className="bg-info-light text-info rounded-lg px-3 py-2 text-sm">
        A chave Pix aparece no checkout para o cliente concluir o pagamento. Confira os dados antes
        de salvar.
      </div>
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pixKeyType">Tipo de chave</Label>
          <select
            id="pixKeyType"
            name="pixKeyType"
            defaultValue={settings?.pixKeyType ?? ''}
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 flex h-11 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-invalid={Boolean(fieldErrors.pixKeyType)}
            aria-describedby={fieldErrors.pixKeyType ? 'pixKeyType-error' : undefined}
          >
            <option value="">Selecione...</option>
            {PIX_KEY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <FieldMessage id="pixKeyType-error" errors={fieldErrors.pixKeyType} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixKey">Chave Pix</Label>
          <div className="flex gap-2">
            <Input
              id="pixKey"
              name="pixKey"
              type={revealed ? 'text' : 'password'}
              autoComplete="off"
              defaultValue={settings?.pixKey ?? ''}
              placeholder="Sua chave Pix"
              className="min-w-0 flex-1"
              aria-invalid={Boolean(fieldErrors.pixKey)}
              aria-describedby={fieldErrors.pixKey ? 'pixKey-error pixKey-help' : 'pixKey-help'}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? 'Ocultar chave Pix' : 'Revelar chave Pix'}
              disabled={!settings?.pixKey && !isDirty}
            >
              {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyPixKey}
              aria-label="Copiar chave Pix"
              disabled={!settings?.pixKey && !isDirty}
            >
              <Copy aria-hidden="true" />
            </Button>
          </div>
          <p id="pixKey-help" className="text-text-secondary text-sm">
            {settings?.pixKeyMasked
              ? `Chave atual: ${settings.pixKeyMasked}`
              : 'Nenhuma chave configurada.'}
          </p>
          <FieldMessage id="pixKey-error" errors={fieldErrors.pixKey} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixRecipient">Nome do beneficiário</Label>
          <Input
            id="pixRecipient"
            name="pixRecipient"
            defaultValue={settings?.pixRecipient ?? ''}
            aria-invalid={Boolean(fieldErrors.pixRecipient)}
            aria-describedby={fieldErrors.pixRecipient ? 'pixRecipient-error' : undefined}
          />
          <FieldMessage id="pixRecipient-error" errors={fieldErrors.pixRecipient} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixBank">Banco</Label>
          <Input
            id="pixBank"
            name="pixBank"
            defaultValue={settings?.pixBank ?? ''}
            placeholder="Ex: Nubank, Inter, BB"
            aria-invalid={Boolean(fieldErrors.pixBank)}
            aria-describedby={fieldErrors.pixBank ? 'pixBank-error' : undefined}
          />
          <FieldMessage id="pixBank-error" errors={fieldErrors.pixBank} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixInstructions">Instruções adicionais</Label>
          <Textarea
            id="pixInstructions"
            name="pixInstructions"
            defaultValue={settings?.pixInstructions ?? ''}
            rows={2}
            placeholder="Ex: Enviar comprovante pelo WhatsApp"
            aria-invalid={Boolean(fieldErrors.pixInstructions)}
            aria-describedby={fieldErrors.pixInstructions ? 'pixInstructions-error' : undefined}
          />
          <FieldMessage id="pixInstructions-error" errors={fieldErrors.pixInstructions} />
        </div>
      </fieldset>

      {!readOnly && (
        <FormActions isDirty={isDirty} onRestore={restore} submitLabel="Salvar configuração Pix" />
      )}
    </form>
  );
}
