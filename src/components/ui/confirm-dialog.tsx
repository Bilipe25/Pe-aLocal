'use client';

import { useState, type ReactNode } from 'react';
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
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      const confirmed = await onConfirm();
      if (confirmed !== false) setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-tinta/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-lg focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-text-secondary">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar confirmação">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={pending}>Cancelar</Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              aria-busy={pending}
              onClick={handleConfirm}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending ? 'Processando…' : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
