'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 2)}${'•'.repeat(Math.min(5, Math.max(1, local.length - 2)))}@${domain}`;
}

export function ConsumerEmailChange(props: { storeSlug: string; currentEmail: string }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const base = `/api/storefront/${encodeURIComponent(props.storeSlug)}/consumer/email-change`;

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${base}/request`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        challengeToken?: string;
      } | null;
      if (!response.ok || !payload?.challengeToken) throw new Error();
      setChallengeToken(payload.challengeToken);
      toast.success('Enviamos um código para o novo e-mail.');
    } catch {
      setErrorMessage('Confira o novo e-mail ou tente novamente em alguns minutos.');
      toast.error('Não foi possível enviar o código agora.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault();
    if (!challengeToken) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`${base}/confirm`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, code }),
      });
      if (!response.ok) throw new Error();
      toast.success('E-mail alterado com segurança.');
      window.location.reload();
    } catch {
      setErrorMessage('Confira o código. Se ele expirou, solicite uma nova alteração.');
      toast.error('Código inválido, expirado ou e-mail indisponível.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="consumer-email-title">
      <h2 id="consumer-email-title" className="font-semibold">
        E-mail de acesso
      </h2>
      <p className="text-text-secondary mt-1 text-sm">Atual: {maskEmail(props.currentEmail)}</p>
      {!challengeToken ? (
        <form className="mt-4 grid gap-3" onSubmit={requestCode}>
          <div className="grid gap-2">
            <Label htmlFor="consumer-new-email">Novo e-mail</Label>
            <Input
              id="consumer-new-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? 'consumer-email-error' : undefined}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrorMessage(null);
              }}
            />
          </div>
          {errorMessage && (
            <p id="consumer-email-error" role="alert" className="text-error text-sm">
              {errorMessage}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar código'}
          </Button>
        </form>
      ) : (
        <form className="mt-4 grid gap-3" onSubmit={confirmCode}>
          <div className="grid gap-2">
            <Label htmlFor="consumer-email-code">Código de seis números</Label>
            <Input
              id="consumer-email-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? 'consumer-email-error' : undefined}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/gu, '').slice(0, 6));
                setErrorMessage(null);
              }}
            />
          </div>
          {errorMessage && (
            <p id="consumer-email-error" role="alert" className="text-error text-sm">
              {errorMessage}
            </p>
          )}
          <Button type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Confirmando…' : 'Confirmar novo e-mail'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setChallengeToken(null);
              setCode('');
              setErrorMessage(null);
            }}
          >
            Trocar endereço
          </Button>
        </form>
      )}
    </section>
  );
}
