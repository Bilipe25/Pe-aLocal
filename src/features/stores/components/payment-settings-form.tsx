'use client';

import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  removePixConfigurationAction,
  updateStorePaymentSettingsAction,
} from '@/features/stores/actions';
import { useStoreForm } from '@/features/stores/use-store-form';

const PIX_KEY_TYPES = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'RANDOM', label: 'Chave aleatória' },
] as const;

interface PaymentSettingsFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  settings: {
    acceptsPix: boolean;
    acceptsCash: boolean;
    acceptsCardOnDelivery: boolean;
    acceptsCardInPerson: boolean;
    pixKeyType: string | null;
    pixKeyMasked: string;
    hasPixKey: boolean;
    hasValidPixConfiguration: boolean;
    pixRecipient: string | null;
    pixBank: string | null;
    pixInstructions: string | null;
  } | null;
}

export function PaymentSettingsForm({
  storeId,
  expectedConfigurationVersion,
  settings,
  readOnly = false,
}: PaymentSettingsFormProps) {
  const initial = {
    acceptsPix: settings?.acceptsPix ?? false,
    acceptsCash: settings?.acceptsCash ?? true,
    acceptsCardOnDelivery: settings?.acceptsCardOnDelivery ?? true,
    acceptsCardInPerson: settings?.acceptsCardInPerson ?? false,
  };
  const [acceptsPix, setAcceptsPix] = useState(initial.acceptsPix);
  const [acceptsCash, setAcceptsCash] = useState(initial.acceptsCash);
  const [acceptsCardOnDelivery, setAcceptsCardOnDelivery] = useState(initial.acceptsCardOnDelivery);
  const [acceptsCardInPerson, setAcceptsCardInPerson] = useState(initial.acceptsCardInPerson);
  const [replacePixKey, setReplacePixKey] = useState(
    initial.acceptsPix && !settings?.hasValidPixConfiguration,
  );
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

  const noPaymentMethod = !acceptsPix && !acceptsCash && !acceptsCardOnDelivery;
  const pixNeedsReplacement = acceptsPix && !settings?.hasValidPixConfiguration;
  const showReplacementFields = acceptsPix && (replacePixKey || !settings?.hasPixKey);

  async function handleSubmit(formData: FormData) {
    const result = await updateStorePaymentSettingsAction(storeId, configurationVersion, formData);
    handleResult(result, 'Configurações de pagamento atualizadas!');
  }

  function handleRestore() {
    restore();
    setAcceptsPix(initial.acceptsPix);
    setAcceptsCash(initial.acceptsCash);
    setAcceptsCardOnDelivery(initial.acceptsCardOnDelivery);
    setAcceptsCardInPerson(initial.acceptsCardInPerson);
    setReplacePixKey(initial.acceptsPix && !settings?.hasValidPixConfiguration);
    setRevealed(false);
  }

  function togglePix(nextValue: boolean) {
    setAcceptsPix(nextValue);
    if (nextValue && !settings?.hasValidPixConfiguration) setReplacePixKey(true);
    markDirty();
  }

  async function removePixConfiguration() {
    const result = await removePixConfigurationAction(storeId, configurationVersion);
    const success = handleResult(result, 'Dados Pix removidos.');
    if (success) {
      setAcceptsPix(false);
      setReplacePixKey(false);
      setRevealed(false);
    }
    return success;
  }

  return (
    <form ref={formRef} action={handleSubmit} onChange={markDirty} className="space-y-5">
      <FormMessage message={formError} fieldErrors={fieldErrors} />

      <fieldset disabled={readOnly} className="space-y-5">
        <section
          className="border-border bg-surface overflow-hidden rounded-xl border"
          aria-labelledby="payment-methods-heading"
        >
          <header className="border-border bg-surface-secondary/40 flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
            <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
              <CreditCard className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="payment-methods-heading" className="text-text-primary font-semibold">
                Formas aceitas no checkout
              </h2>
              <p className="text-text-secondary mt-0.5 text-sm">
                Mantenha ao menos uma opção disponível para o cliente.
              </p>
            </div>
          </header>

          <div className="divide-border divide-y px-4 sm:px-5">
            <div className="py-3">
              <div className="flex min-h-14 items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <QrCode className="text-text-muted size-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor="acceptsPix" className="font-semibold">
                        Pix
                      </Label>
                      {settings?.hasValidPixConfiguration ? (
                        <Badge variant={acceptsPix ? 'success' : 'secondary'}>
                          {acceptsPix ? 'Ativo' : 'Configurado'}
                        </Badge>
                      ) : acceptsPix ? (
                        <Badge variant="warning">Requer configuração</Badge>
                      ) : null}
                    </div>
                    <p className="text-text-secondary mt-0.5 text-sm">
                      Pagamento usando a chave da unidade.
                    </p>
                  </div>
                </div>
                <input type="hidden" name="acceptsPix" value="false" />
                <Switch
                  id="acceptsPix"
                  name="acceptsPix"
                  checked={acceptsPix}
                  onCheckedChange={togglePix}
                  value="true"
                  aria-invalid={Boolean(fieldErrors.acceptsPix) || noPaymentMethod}
                  aria-describedby={
                    fieldErrors.acceptsPix || noPaymentMethod ? 'acceptsPix-error' : undefined
                  }
                />
              </div>

              {acceptsPix ? (
                <div className="border-border bg-surface-secondary/35 mt-3 rounded-lg border p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-text-primary flex items-center gap-2 text-sm font-semibold">
                        <KeyRound className="size-4" aria-hidden="true" /> Dados do Pix
                      </p>
                      <p className="text-text-secondary mt-1 text-sm">
                        {settings?.pixKeyMasked
                          ? `Chave atual: ${settings.pixKeyMasked}`
                          : 'Nenhuma chave válida configurada.'}
                      </p>
                    </div>
                    {settings?.hasPixKey && !pixNeedsReplacement ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReplacePixKey((value) => !value);
                          setRevealed(false);
                          markDirty();
                        }}
                      >
                        <RefreshCw aria-hidden="true" />
                        {replacePixKey ? 'Cancelar troca' : 'Substituir chave'}
                      </Button>
                    ) : null}
                  </div>

                  <input
                    type="hidden"
                    name="replacePixKey"
                    value={showReplacementFields ? 'true' : 'false'}
                  />

                  {showReplacementFields ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="pixKeyType">Tipo da nova chave</Label>
                        <select
                          id="pixKeyType"
                          name="pixKeyType"
                          defaultValue={settings?.pixKeyType ?? ''}
                          className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 flex h-11 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                          aria-invalid={Boolean(fieldErrors.pixKeyType)}
                          aria-describedby={fieldErrors.pixKeyType ? 'pixKeyType-error' : undefined}
                        >
                          <option value="">Selecione...</option>
                          {PIX_KEY_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                        <FieldMessage id="pixKeyType-error" errors={fieldErrors.pixKeyType} />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pixKey">Nova chave Pix</Label>
                        <div className="flex gap-2">
                          <Input
                            id="pixKey"
                            name="pixKey"
                            type={revealed ? 'text' : 'password'}
                            autoComplete="off"
                            placeholder="Informe a nova chave"
                            className="min-w-0 flex-1"
                            aria-invalid={Boolean(fieldErrors.pixKey)}
                            aria-describedby={fieldErrors.pixKey ? 'pixKey-error' : undefined}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setRevealed((value) => !value)}
                            aria-label={
                              revealed ? 'Ocultar nova chave Pix' : 'Revelar nova chave Pix'
                            }
                          >
                            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                          </Button>
                        </div>
                        <FieldMessage id="pixKey-error" errors={fieldErrors.pixKey} />
                      </div>
                    </div>
                  ) : (
                    <input type="hidden" name="pixKeyType" value={settings?.pixKeyType ?? ''} />
                  )}

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="pixRecipient">Nome do beneficiário</Label>
                      <Input
                        id="pixRecipient"
                        name="pixRecipient"
                        defaultValue={settings?.pixRecipient ?? ''}
                        aria-invalid={Boolean(fieldErrors.pixRecipient)}
                        aria-describedby={
                          fieldErrors.pixRecipient ? 'pixRecipient-error' : undefined
                        }
                      />
                      <FieldMessage id="pixRecipient-error" errors={fieldErrors.pixRecipient} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pixBank">Banco</Label>
                      <Input
                        id="pixBank"
                        name="pixBank"
                        defaultValue={settings?.pixBank ?? ''}
                        placeholder="Ex.: Nubank, Inter, BB"
                        aria-invalid={Boolean(fieldErrors.pixBank)}
                        aria-describedby={fieldErrors.pixBank ? 'pixBank-error' : undefined}
                      />
                      <FieldMessage id="pixBank-error" errors={fieldErrors.pixBank} />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor="pixInstructions">Instruções para o cliente</Label>
                    <Textarea
                      id="pixInstructions"
                      name="pixInstructions"
                      defaultValue={settings?.pixInstructions ?? ''}
                      rows={2}
                      placeholder="Ex.: Envie o comprovante pelo WhatsApp"
                      aria-invalid={Boolean(fieldErrors.pixInstructions)}
                      aria-describedby={
                        fieldErrors.pixInstructions ? 'pixInstructions-error' : undefined
                      }
                    />
                    <FieldMessage id="pixInstructions-error" errors={fieldErrors.pixInstructions} />
                  </div>
                </div>
              ) : settings?.hasPixKey ? (
                <p className="text-text-secondary mt-2 text-sm">
                  Os dados Pix estão preservados, mas não são exibidos ao cliente.
                </p>
              ) : null}
            </div>

            <div className="flex min-h-20 items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Banknote className="text-text-muted size-5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="acceptsCash" className="font-semibold">
                      Dinheiro
                    </Label>
                    <Badge variant={acceptsCash ? 'success' : 'secondary'}>
                      {acceptsCash ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-0.5 text-sm">
                    O checkout permite informar o valor para troco.
                  </p>
                </div>
              </div>
              <input type="hidden" name="acceptsCash" value="false" />
              <Switch
                id="acceptsCash"
                name="acceptsCash"
                checked={acceptsCash}
                onCheckedChange={(value) => {
                  setAcceptsCash(value);
                  markDirty();
                }}
                value="true"
              />
            </div>

            <div className="flex min-h-20 items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <CreditCard className="text-text-muted size-5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="acceptsCardInPerson" className="font-semibold">
                      Cartão na mesa
                    </Label>
                    <Badge variant={acceptsCardInPerson ? 'success' : 'secondary'}>
                      {acceptsCardInPerson ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-0.5 text-sm">
                    Pagamento presencial por maquininha nos pedidos do salão.
                  </p>
                </div>
              </div>
              <input type="hidden" name="acceptsCardInPerson" value="false" />
              <Switch
                id="acceptsCardInPerson"
                name="acceptsCardInPerson"
                checked={acceptsCardInPerson}
                onCheckedChange={(value) => {
                  setAcceptsCardInPerson(value);
                  markDirty();
                }}
                value="true"
              />
            </div>

            <div className="flex min-h-20 items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <CreditCard className="text-text-muted size-5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="acceptsCardOnDelivery" className="font-semibold">
                      Cartão no recebimento
                    </Label>
                    <Badge variant={acceptsCardOnDelivery ? 'success' : 'secondary'}>
                      {acceptsCardOnDelivery ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-0.5 text-sm">
                    Pagamento na entrega ou na retirada do pedido.
                  </p>
                </div>
              </div>
              <input type="hidden" name="acceptsCardOnDelivery" value="false" />
              <Switch
                id="acceptsCardOnDelivery"
                name="acceptsCardOnDelivery"
                checked={acceptsCardOnDelivery}
                onCheckedChange={(value) => {
                  setAcceptsCardOnDelivery(value);
                  markDirty();
                }}
                value="true"
              />
            </div>
          </div>

          <div className="px-4 pb-4 sm:px-5">
            {noPaymentMethod ? (
              <div
                id="acceptsPix-error"
                className="border-error/25 bg-error-light text-error flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Mantenha ao menos uma forma de pagamento habilitada.
              </div>
            ) : (
              <FieldMessage id="acceptsPix-error" errors={fieldErrors.acceptsPix} />
            )}
          </div>
        </section>

        <div className="border-info/25 bg-info-light text-text-primary flex items-start gap-3 rounded-xl border p-3 text-sm">
          <ShieldCheck className="text-info mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            A chave existente permanece protegida no servidor. Esta página recebe somente a versão
            mascarada; para alterá-la, use “Substituir chave”.
          </p>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-end sm:justify-between">
        {!readOnly && settings?.hasPixKey ? (
          <ConfirmDialog
            title="Remover os dados Pix?"
            description="A chave e as instruções serão removidas desta unidade, e o Pix será desativado. Esta ação não pode ser desfeita."
            confirmLabel="Remover dados Pix"
            destructive
            onConfirm={removePixConfiguration}
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="text-error hover:bg-error-light hover:text-error justify-start"
                disabled={isDirty}
                title={
                  isDirty ? 'Salve ou restaure as alterações antes de remover o Pix.' : undefined
                }
              >
                <Trash2 aria-hidden="true" /> Remover dados Pix
              </Button>
            }
          />
        ) : (
          <span />
        )}

        {!readOnly ? (
          <div className="min-w-0 flex-1">
            <FormActions
              isDirty={isDirty}
              onRestore={handleRestore}
              submitLabel="Salvar pagamentos"
              compactMobile
              submitDisabled={noPaymentMethod}
            />
          </div>
        ) : null}
      </div>
    </form>
  );
}
