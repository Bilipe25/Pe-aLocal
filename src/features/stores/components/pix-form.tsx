'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updatePixConfigAction } from '@/features/stores/actions';
import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
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
  readOnly?: boolean;
  settings: {
    pixKeyType: string | null;
    pixKey: string | null;
    pixRecipient: string | null;
    pixBank: string | null;
    pixInstructions: string | null;
  } | null;
}

export function PixForm({ storeId, settings, readOnly = false }: PixFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await updatePixConfigAction(storeId, formData);
    if (result.success) {
      toast.success('Configuração de Pix atualizada!');
      router.refresh();
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormMessage message={error} />
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pixKeyType">Tipo de chave</Label>
          <select
            id="pixKeyType"
            name="pixKeyType"
            defaultValue={settings?.pixKeyType ?? ''}
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 flex h-11 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">Selecione...</option>
            {PIX_KEY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixKey">Chave Pix</Label>
          <Input
            id="pixKey"
            name="pixKey"
            defaultValue={settings?.pixKey ?? ''}
            placeholder="Sua chave Pix"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixRecipient">Nome do beneficiário</Label>
          <Input
            id="pixRecipient"
            name="pixRecipient"
            defaultValue={settings?.pixRecipient ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixBank">Banco</Label>
          <Input
            id="pixBank"
            name="pixBank"
            defaultValue={settings?.pixBank ?? ''}
            placeholder="Ex: Nubank, Inter, BB"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pixInstructions">Instruções adicionais</Label>
          <Textarea
            id="pixInstructions"
            name="pixInstructions"
            defaultValue={settings?.pixInstructions ?? ''}
            rows={2}
            placeholder="Ex: Enviar comprovante pelo WhatsApp"
          />
        </div>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end pt-2">
          <FormSubmitButton>Salvar configuração Pix</FormSubmitButton>
        </div>
      )}
    </form>
  );
}
