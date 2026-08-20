'use client';

import { Bell, CheckCircle2, Loader2, ReceiptText, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { requestDiningServiceAction } from '@/features/dining-room/actions';

interface DiningSessionActionsProps {
  sessionToken: string;
  continueOrderingHref: string;
  assistanceRequested?: boolean;
  billRequested?: boolean;
  publicOperationsEnabled?: boolean;
  continueVariant?: 'default' | 'outline';
}

export function DiningSessionActions({
  sessionToken,
  continueOrderingHref,
  assistanceRequested = false,
  billRequested = false,
  publicOperationsEnabled = true,
  continueVariant = 'default',
}: DiningSessionActionsProps) {
  const [assistance, setAssistance] = useState(assistanceRequested);
  const [bill, setBill] = useState(billRequested);
  const [error, setError] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<'ASSISTANCE' | 'BILL' | null>(null);
  const [isPending, startTransition] = useTransition();

  function request(type: 'ASSISTANCE' | 'BILL') {
    setError(null);
    setPendingType(type);
    startTransition(async () => {
      const result = await requestDiningServiceAction(sessionToken, {
        type,
        idempotencyKey: crypto.randomUUID(),
      });
      setPendingType(null);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      if (type === 'ASSISTANCE') setAssistance(true);
      else setBill(true);
    });
  }

  return (
    <section className="dining-session-actions" aria-labelledby="dining-session-actions-title">
      <h2 id="dining-session-actions-title">Continue seu atendimento</h2>
      <Button
        asChild
        variant={continueVariant}
        className={continueVariant === 'default' ? 'storefront-primary-action' : undefined}
      >
        <Link href={continueOrderingHref}>
          <RotateCcw aria-hidden="true" /> Fazer outro pedido
        </Link>
      </Button>

      <div className="dining-session-help-grid">
        <div>
          <strong>Precisa de ajuda?</strong>
          <p>{assistance ? 'Chamamos a equipe.' : 'Avise a equipe sem sair da mesa.'}</p>
          <Button
            type="button"
            variant="outline"
            disabled={!publicOperationsEnabled || assistance || isPending}
            onClick={() => request('ASSISTANCE')}
          >
            {pendingType === 'ASSISTANCE' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : assistance ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <Bell aria-hidden="true" />
            )}
            {assistance ? 'Equipe avisada' : 'Chamar atendimento'}
          </Button>
        </div>
        <div>
          <strong>Terminou?</strong>
          <p>{bill ? 'O pedido de conta foi enviado.' : 'Peça a conta quando estiver pronto.'}</p>
          <Button
            type="button"
            variant="outline"
            disabled={!publicOperationsEnabled || bill || isPending}
            onClick={() => request('BILL')}
          >
            {pendingType === 'BILL' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : bill ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <ReceiptText aria-hidden="true" />
            )}
            {bill ? 'Conta solicitada' : 'Pedir a conta'}
          </Button>
        </div>
      </div>
      {!publicOperationsEnabled ? (
        <p className="dining-session-message" role="status">
          As solicitações pelo salão estão pausadas. Fale diretamente com a equipe.
        </p>
      ) : null}
      {error ? (
        <p className="dine-in-checkout-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {assistance ? 'A solicitação de atendimento foi registrada.' : ''}
        {bill ? 'A solicitação de conta foi registrada.' : ''}
      </p>
    </section>
  );
}
