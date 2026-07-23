'use client';

import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CancelOrderInput } from '@/features/orders/schemas';

const REASONS: Array<{ value: CancelOrderInput['reasonCode']; label: string }> = [
  { value: 'CUSTOMER_REQUEST', label: 'Solicitação do cliente' },
  { value: 'PRODUCT_UNAVAILABLE', label: 'Produto indisponível' },
  { value: 'STORE_UNABLE_TO_FULFILL', label: 'Loja não consegue atender' },
  { value: 'ADDRESS_PROBLEM', label: 'Problema com o endereço' },
  { value: 'PAYMENT_NOT_IDENTIFIED', label: 'Pagamento não identificado' },
  { value: 'DUPLICATE_ORDER', label: 'Pedido duplicado' },
  { value: 'FRAUD_SUSPECTED', label: 'Suspeita de fraude' },
  { value: 'OTHER', label: 'Outro' },
];

interface CancelOrderDialogProps {
  orderNumber: number;
  trigger: ReactNode;
  onConfirm: (
    reasonCode: CancelOrderInput['reasonCode'],
    note: string | undefined,
  ) => Promise<boolean>;
}

export function CancelOrderDialog({
  orderNumber,
  trigger,
  onConfirm,
}: CancelOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reasonCode, setReasonCode] = useState<CancelOrderInput['reasonCode'] | ''>('');
  const [note, setNote] = useState('');
  const noteRequired = reasonCode === 'OTHER';
  const canSubmit = Boolean(reasonCode) && (!noteRequired || Boolean(note.trim()));

  async function handleConfirm() {
    if (!reasonCode || !canSubmit) return;
    setPending(true);
    try {
      const confirmed = await onConfirm(reasonCode, note.trim() || undefined);
      if (confirmed) {
        setOpen(false);
        setReasonCode('');
        setNote('');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-tinta/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-lg focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-text-primary">
                Cancelar o pedido #{orderNumber}?
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-text-secondary">
                O pedido será encerrado. Pagamentos pendentes também serão cancelados; pedidos pagos exigem reembolso antes desta ação.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar cancelamento">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`cancel-reason-${orderNumber}`}>Motivo</Label>
              <select
                id={`cancel-reason-${orderNumber}`}
                value={reasonCode}
                onChange={(event) =>
                  setReasonCode(event.target.value as CancelOrderInput['reasonCode'] | '')
                }
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                disabled={pending}
              >
                <option value="">Selecione um motivo</option>
                {REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`cancel-note-${orderNumber}`}>
                Observação {noteRequired ? '(obrigatória)' : '(opcional)'}
              </Label>
              <Textarea
                id={`cancel-note-${orderNumber}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={4}
                disabled={pending}
                placeholder="Contexto útil para a equipe, sem dados sensíveis desnecessários"
              />
              <p className="text-right text-xs text-text-secondary">{note.length}/500</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={pending}>Voltar</Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={pending || !canSubmit}
              aria-busy={pending}
              onClick={handleConfirm}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
