'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateStoreAction } from '@/features/stores/actions';
import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { useStoreForm } from '@/features/stores/use-store-form';
import { formatPhone } from '@/lib/brazil';

interface StoreGeneralFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  store: {
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
}

export function StoreGeneralForm({
  storeId,
  expectedConfigurationVersion,
  store,
  readOnly = false,
}: StoreGeneralFormProps) {
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
    const result = await updateStoreAction(storeId, configurationVersion, formData);
    handleResult(result, 'Loja atualizada com sucesso!');
  }

  return (
    <form ref={formRef} action={handleSubmit} onChange={markDirty} className="space-y-4">
      <FormMessage message={formError} fieldErrors={fieldErrors} />
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome da loja</Label>
          <Input
            id="name"
            name="name"
            defaultValue={store.name}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
          />
          <FieldMessage id="name-error" errors={fieldErrors.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Endereço da loja</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-text-secondary shrink-0 text-sm">pedidolocal.com.br/</span>
            <Input
              id="slug"
              name="slug"
              defaultValue={store.slug}
              required
              className="flex-1"
              aria-invalid={Boolean(fieldErrors.slug)}
              aria-describedby={fieldErrors.slug ? 'slug-error slug-help' : 'slug-help'}
            />
          </div>
          <p id="slug-help" className="text-text-secondary text-sm">
            Este é o link público do seu cardápio. Use letras minúsculas, números e hífens.
          </p>
          <FieldMessage id="slug-error" errors={fieldErrors.slug} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={store.description ?? ''}
            rows={3}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={fieldErrors.description ? 'description-error' : undefined}
          />
          <FieldMessage id="description-error" errors={fieldErrors.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={store.phone ? formatPhone(store.phone) : ''}
              placeholder="(11) 99999-9999"
              maxLength={20}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
            />
            <FieldMessage id="phone-error" errors={fieldErrors.phone} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              defaultValue={store.whatsapp ? formatPhone(store.whatsapp) : ''}
              placeholder="(11) 99999-9999"
              maxLength={20}
              aria-invalid={Boolean(fieldErrors.whatsapp)}
              aria-describedby={fieldErrors.whatsapp ? 'whatsapp-error' : undefined}
            />
            <FieldMessage id="whatsapp-error" errors={fieldErrors.whatsapp} />
          </div>
        </div>
      </fieldset>

      {!readOnly && (
        <FormActions isDirty={isDirty} onRestore={restore} submitLabel="Salvar alterações" />
      )}
    </form>
  );
}
