'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Home, Loader2, MapPin, Plus, UserRound, X } from 'lucide-react';
import { useRef, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CustomerRecognitionResult } from '@/types/customer-recognition';

type RecognizedCustomer = Extract<CustomerRecognitionResult, { recognized: true }>;
type RecognitionAction = 'confirm' | 'new-address' | 'not-me';

interface CustomerRecognitionDialogProps {
  open: boolean;
  customer: RecognizedCustomer;
  selectedReference: string | null;
  pendingAction: RecognitionAction | null;
  error?: string | null;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onSelectAddress: (opaqueReference: string) => void;
  onConfirm: () => void;
  onUseNewAddress: () => void;
  onNotMe: () => void;
}

export function CustomerRecognitionDialog({
  open,
  customer,
  selectedReference,
  pendingAction,
  error,
  returnFocusRef,
  onOpenChange,
  onSelectAddress,
  onConfirm,
  onUseNewAddress,
  onNotMe,
}: CustomerRecognitionDialogProps) {
  const firstAddressRef = useRef<HTMLInputElement>(null);
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);
  const addresses = customer.maskedAddresses.slice(0, 5);
  const busy = pendingAction !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="customer-recognition-overlay" />
        <Dialog.Content
          className="customer-recognition-dialog"
          aria-describedby="customer-recognition-description"
          onOpenAutoFocus={(event) => {
            if (!firstAddressRef.current) return;
            event.preventDefault();
            firstAddressRef.current.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <span className="customer-recognition-handle" aria-hidden="true" />

          <header className="flex items-start gap-3">
            <span className="storefront-checkout-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-tinta text-xl font-bold text-balance">
                Bem-vindo de volta, {customer.maskedName}!
              </Dialog.Title>
              <Dialog.Description
                id="customer-recognition-description"
                className="text-text-muted mt-1 text-sm text-pretty"
              >
                Confirme se reconhece os dados abaixo. {customer.maskedPhone}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar reconhecimento rápido"
                disabled={busy}
                className="text-tinta shrink-0"
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </header>

          <fieldset className="mt-5 space-y-2 border-0 p-0">
            <legend className="text-tinta mb-3 text-sm font-bold">Onde você quer receber?</legend>
            {addresses.map((address, index) => {
              const selected = selectedReference === address.opaqueReference;
              return (
                <label
                  key={address.opaqueReference}
                  className="customer-recognition-address group block cursor-pointer"
                >
                  <input
                    ref={index === 0 ? firstAddressRef : undefined}
                    type="radio"
                    name="recognized-address"
                    checked={selected}
                    onChange={() => onSelectAddress(address.opaqueReference)}
                    disabled={busy}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'flex min-h-16 items-start gap-3 rounded-xl border p-3 transition-colors',
                      'peer-focus-visible:ring-pimenta peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
                      selected
                        ? 'storefront-selection-control storefront-selection-row'
                        : 'border-tinta/15 bg-papel',
                    )}
                  >
                    <span className="bg-tinta/5 text-tinta flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                      {address.label.toLocaleLowerCase('pt-BR').includes('casa') ? (
                        <Home className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-tinta block text-sm font-bold">{address.label}</span>
                      <span className="text-text-muted mt-0.5 block text-sm text-pretty">
                        {address.maskedAddress}
                      </span>
                      {address.lastUsedLabel ? (
                        <span className="storefront-action-text mt-1 block text-xs font-semibold">
                          {address.lastUsedLabel}
                        </span>
                      ) : null}
                      {address.requiresDeliveryZoneSelection ? (
                        <span className="text-text-muted mt-1 block text-xs">
                          Confirme a região atendida na próxima etapa.
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'customer-recognition-address-mark border-tinta/20 mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                        selected && 'is-selected',
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <p className="sr-only" aria-live="polite">
            {error ?? ''}
          </p>
          {error ? (
            <p className="border-error/20 bg-error-light text-tinta mt-4 rounded-xl border p-3 text-sm">
              {error}
            </p>
          ) : null}

          <div className="mt-5 grid gap-2">
            <Button
              type="button"
              className="storefront-primary-action w-full"
              disabled={!selectedReference || busy}
              onClick={onConfirm}
            >
              {pendingAction === 'confirm' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Sim, continuar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-tinta/15 bg-papel text-tinta w-full"
              disabled={busy}
              onClick={onUseNewAddress}
            >
              {pendingAction === 'new-address' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Usar outro endereço
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-text-muted hover:text-tinta w-full"
              disabled={busy}
              onClick={onNotMe}
            >
              {pendingAction === 'not-me' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Não sou eu
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
