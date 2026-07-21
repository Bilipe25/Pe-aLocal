'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateAddressAction } from '@/features/stores/actions';
import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { useStoreForm } from '@/features/stores/use-store-form';
import { formatZipCode } from '@/lib/brazil';

interface AddressFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  } | null;
}

export function AddressForm({
  storeId,
  expectedConfigurationVersion,
  address,
  readOnly = false,
}: AddressFormProps) {
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
    const result = await updateAddressAction(storeId, configurationVersion, formData);
    handleResult(result, 'Endereço atualizado!');
  }

  return (
    <form ref={formRef} action={handleSubmit} onChange={markDirty} className="space-y-4">
      <FormMessage message={formError} fieldErrors={fieldErrors} />
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="zipCode">CEP</Label>
          <Input
            id="zipCode"
            name="zipCode"
            inputMode="numeric"
            autoComplete="postal-code"
            defaultValue={address?.zipCode ? formatZipCode(address.zipCode) : ''}
            placeholder="00000-000"
            className="w-40 max-w-full"
            maxLength={9}
            aria-invalid={Boolean(fieldErrors.zipCode)}
            aria-describedby={fieldErrors.zipCode ? 'zipCode-error' : undefined}
          />
          <FieldMessage id="zipCode-error" errors={fieldErrors.zipCode} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="street">Rua</Label>
            <Input
              id="street"
              name="street"
              autoComplete="street-address"
              defaultValue={address?.street ?? ''}
              required
              aria-invalid={Boolean(fieldErrors.street)}
              aria-describedby={fieldErrors.street ? 'street-error' : undefined}
            />
            <FieldMessage id="street-error" errors={fieldErrors.street} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="number">Número</Label>
            <Input
              id="number"
              name="number"
              defaultValue={address?.number ?? ''}
              required
              aria-invalid={Boolean(fieldErrors.number)}
              aria-describedby={fieldErrors.number ? 'number-error' : undefined}
            />
            <FieldMessage id="number-error" errors={fieldErrors.number} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="complement">Complemento</Label>
          <Input
            id="complement"
            name="complement"
            defaultValue={address?.complement ?? ''}
            placeholder="Sala, bloco, etc."
            aria-invalid={Boolean(fieldErrors.complement)}
            aria-describedby={fieldErrors.complement ? 'complement-error' : undefined}
          />
          <FieldMessage id="complement-error" errors={fieldErrors.complement} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="neighborhood">Bairro</Label>
            <Input
              id="neighborhood"
              name="neighborhood"
              defaultValue={address?.neighborhood ?? ''}
              required
              aria-invalid={Boolean(fieldErrors.neighborhood)}
              aria-describedby={fieldErrors.neighborhood ? 'neighborhood-error' : undefined}
            />
            <FieldMessage id="neighborhood-error" errors={fieldErrors.neighborhood} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              name="city"
              autoComplete="address-level2"
              defaultValue={address?.city ?? ''}
              required
              aria-invalid={Boolean(fieldErrors.city)}
              aria-describedby={fieldErrors.city ? 'city-error' : undefined}
            />
            <FieldMessage id="city-error" errors={fieldErrors.city} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">Estado</Label>
            <Input
              id="state"
              name="state"
              autoComplete="address-level1"
              defaultValue={address?.state ?? ''}
              required
              maxLength={2}
              placeholder="SP"
              className="w-20 max-w-full"
              aria-invalid={Boolean(fieldErrors.state)}
              aria-describedby={fieldErrors.state ? 'state-error' : undefined}
            />
            <FieldMessage id="state-error" errors={fieldErrors.state} />
          </div>
        </div>
      </fieldset>

      {!readOnly && (
        <FormActions isDirty={isDirty} onRestore={restore} submitLabel="Salvar endereço" />
      )}
    </form>
  );
}
