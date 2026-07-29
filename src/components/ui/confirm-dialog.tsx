'use client';

import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  destructive?: boolean;
  pendingLabel?: string;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
  pendingLabel = 'Processando…',
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const portalContainer =
    typeof document === 'undefined'
      ? undefined
      : (document.querySelector<HTMLElement>('.storefront-theme') ?? undefined);

  async function handleConfirm() {
    setPending(true);
    try {
      const confirmed = await onConfirm();
      if (confirmed !== false) setOpen(false);
    } finally {
      setPending(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay
          className="confirm-dialog-overlay bg-tinta/50 fixed inset-0 z-40"
          onClick={() => handleOpenChange(false)}
        />
        <Dialog.Content
          className="confirm-dialog-content bg-surface fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-lg focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="confirm-dialog-title text-text-primary text-lg font-semibold">
                {title}
              </Dialog.Title>
              <Dialog.Description className="confirm-dialog-description text-text-secondary mt-2 text-sm">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="confirm-dialog-close"
                aria-label="Fechar confirmação"
                disabled={pending}
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button
                ref={cancelRef}
                variant="outline"
                className="confirm-dialog-cancel"
                disabled={pending}
              >
                Cancelar
              </Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              className="confirm-dialog-confirm"
              disabled={pending}
              aria-busy={pending}
              onClick={handleConfirm}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
