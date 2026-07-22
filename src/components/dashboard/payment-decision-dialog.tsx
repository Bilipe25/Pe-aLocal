'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MarkPaymentFailedInput, RefundPaymentInput } from '@/features/orders/schemas';
import { formatCurrency } from '@/lib/utils';

const FAILURE_REASONS: Array<{
  value: MarkPaymentFailedInput['reasonCode'];
  label: string;
}> = [
  { value: 'PAYMENT_NOT_IDENTIFIED', label: 'Pagamento não identificado' },
  { value: 'PROOF_INVALID', label: 'Comprovante inválido' },
  { value: 'OTHER', label: 'Outro' },
];

const REFUND_REASONS: Array<{
  value: RefundPaymentInput['reasonCode'];
  label: string;
}> = [
  { value: 'CUSTOMER_REQUEST', label: 'Solicitação do cliente' },
  { value: 'ORDER_CANCELLATION', label: 'Cancelamento do pedido' },
  { value: 'STORE_DECISION', label: 'Decisão da loja' },
  { value: 'OTHER', label: 'Outro' },
];

type PaymentDecisionDialogProps = {
  orderNumber: number;
  trigger: ReactNode;
  total: number;
} & (
  | {
      kind: 'failure';
      onConfirm: (
        reasonCode: MarkPaymentFailedInput['reasonCode'],
        note: string | undefined,
      ) => Promise<boolean>;
    }
  | {
      kind: 'refund';
      onConfirm: (
        reasonCode: RefundPaymentInput['reasonCode'],
        note: string | undefined,
      ) => Promise<boolean>;
    }
);

export function PaymentDecisionDialog(props: PaymentDecisionDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
  const [note, setNote] = useState('');
  const reasons = props.kind === 'failure' ? FAILURE_REASONS : REFUND_REASONS;
  const noteRequired = reasonCode === 'OTHER';
  const canSubmit = Boolean(reasonCode) && (!noteRequired || Boolean(note.trim()));

  async function handleConfirm() {
    if (!reasonCode || !canSubmit) return;
    setPending(true);
    try {
      const confirmed =
        props.kind === 'failure'
          ? await props.onConfirm(
              reasonCode as MarkPaymentFailedInput['reasonCode'],
              note.trim() || undefined,
            )
          : await props.onConfirm(
              reasonCode as RefundPaymentInput['reasonCode'],
              note.trim() || undefined,
            );
      if (confirmed) {
        setOpen(false);
        setReasonCode('');
        setNote('');
      }
    } finally {
      setPending(false);
    }
  }

  const refund = props.kind === 'refund';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{props.trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-tinta/50 fixed inset-0 z-50" />
        <Dialog.Content className="bg-surface fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-lg focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-text-primary text-lg font-semibold">
                {refund
                  ? `Reembolsar o pedido #${props.orderNumber}?`
                  : `Pagamento do pedido #${props.orderNumber} não identificado?`}
              </Dialog.Title>
              <Dialog.Description className="text-text-secondary mt-2 text-sm">
                {refund
                  ? `Será registrado um reembolso integral de ${formatCurrency(props.total)}. A devolução no meio de pagamento deve ser realizada antes desta confirmação.`
                  : 'O cliente poderá ser orientado a verificar o Pix. A equipe poderá reabrir a análise depois.'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar decisão de pagamento">
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`payment-reason-${props.orderNumber}`}>Motivo</Label>
              <select
                id={`payment-reason-${props.orderNumber}`}
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                disabled={pending}
              >
                <option value="">Selecione um motivo</option>
                {reasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`payment-note-${props.orderNumber}`}>
                Observação {noteRequired ? '(obrigatória)' : '(opcional)'}
              </Label>
              <Textarea
                id={`payment-note-${props.orderNumber}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={4}
                disabled={pending}
                placeholder="Contexto operacional, sem dados financeiros sensíveis"
              />
              <p className="text-text-secondary text-right text-xs">{note.length}/500</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={pending}>
                Voltar
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              disabled={pending || !canSubmit}
              aria-busy={pending}
              onClick={handleConfirm}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {pending
                ? 'Salvando…'
                : refund
                  ? 'Registrar reembolso'
                  : 'Marcar como não identificado'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
