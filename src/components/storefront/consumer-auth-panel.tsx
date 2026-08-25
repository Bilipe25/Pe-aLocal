'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, Loader2, Mail, MessageSquareText, Smartphone, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPhoneInput } from '@/lib/brazil';

type Purpose = 'LOGIN' | 'ORDER_CLAIM' | 'DEVICE_CLAIM';

export function ConsumerAuthPanel({
  storeSlug,
  storeName,
  purpose = 'LOGIN',
  trackingToken,
  compact = false,
  verificationMethod,
}: {
  storeSlug: string;
  storeName: string;
  purpose?: Purpose;
  trackingToken?: string;
  compact?: boolean;
  verificationMethod: 'email' | 'phone';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<'identifier' | 'code'>('identifier');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || step !== 'code') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open, step]);

  async function post(path: string, body: unknown) {
    const response = await fetch(
      `/api/storefront/${encodeURIComponent(storeSlug)}/consumer-auth/${path}`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      challengeToken?: string;
      resendAfter?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.message ?? 'Não foi possível continuar agora.');
    return payload;
  }

  function requestCode() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = await post('request-verification', {
          ...(verificationMethod === 'email' && email ? { email } : {}),
          ...(verificationMethod === 'phone' && phone ? { phone } : {}),
          purpose,
          ...(trackingToken ? { trackingToken } : {}),
        });
        if (!payload?.challengeToken) throw new Error('Não foi possível iniciar a confirmação.');
        setChallengeToken(payload.challengeToken);
        setResendAt(payload.resendAfter ? Date.parse(payload.resendAfter) : Date.now() + 60_000);
        setNow(Date.now());
        setStep('code');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível continuar.');
      }
    });
  }

  function verifyCode() {
    if (!challengeToken) return;
    setError(null);
    startTransition(async () => {
      try {
        await post('verify', { challengeToken, code });
        setOpen(false);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Código inválido.');
      }
    });
  }

  function resend() {
    if (!challengeToken || resendAt > now) return;
    setError(null);
    startTransition(async () => {
      try {
        const payload = await post('resend', { challengeToken });
        setResendAt(payload?.resendAfter ? Date.parse(payload.resendAfter) : Date.now() + 60_000);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível reenviar.');
      }
    });
  }

  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1_000));
  if (dismissed) return null;

  function openPanel() {
    setOpen(true);
    if (purpose === 'ORDER_CLAIM' && verificationMethod === 'phone') requestCode();
  }

  const isEmail = verificationMethod === 'email';
  const needsIdentifierInput = purpose !== 'ORDER_CLAIM' || isEmail;

  return (
    <>
      <div
        className={compact ? '' : 'border-border bg-surface-tertiary mt-6 rounded-xl border p-4'}
      >
        {!compact ? (
          <>
            <div className="flex items-center gap-2">
              {isEmail ? (
                <Mail className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              )}
              <h2 className="font-bold">Encontre seus pedidos em qualquer aparelho</h2>
            </div>
            <p className="text-text-secondary mt-1 text-sm">
              {isEmail
                ? 'Confirme seu e-mail para acessar seus pedidos e endereços salvos.'
                : 'Confirme seu celular para acessar seus pedidos e endereços salvos.'}
            </p>
          </>
        ) : null}
        <Button
          type="button"
          variant={compact ? 'outline' : 'secondary'}
          className={compact ? '' : 'mt-3 w-full'}
          onClick={openPanel}
        >
          {purpose === 'ORDER_CLAIM' ? 'Guardar meus pedidos' : 'Ver todo meu histórico'}
        </Button>
        {purpose === 'ORDER_CLAIM' ? (
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => setDismissed(true)}
          >
            Agora não
          </Button>
        ) : null}
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
          <Dialog.Content className="bg-surface fixed inset-x-3 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2 rounded-xl p-5 shadow-xl focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="text-xl font-bold">
                  {step === 'identifier'
                    ? isEmail
                      ? purpose === 'ORDER_CLAIM'
                        ? 'Guardar meus pedidos'
                        : 'Acesse seus pedidos'
                      : 'Confirmar celular'
                    : 'Digite o código'}
                </Dialog.Title>
                <Dialog.Description className="text-text-secondary mt-1 text-sm">
                  {step === 'identifier'
                    ? isEmail
                      ? purpose === 'ORDER_CLAIM'
                        ? 'Informe o e-mail que você quer usar para acessar este pedido em qualquer aparelho.'
                        : `Acesse seus pedidos de ${storeName} em qualquer aparelho.`
                      : purpose === 'ORDER_CLAIM'
                        ? 'Enviaremos um código para o celular usado neste pedido.'
                        : `Veja seus pedidos de ${storeName} em qualquer aparelho.`
                    : isEmail
                      ? `Enviamos seis números para ${email}.`
                      : purpose === 'ORDER_CLAIM'
                        ? 'Enviamos seis números para o celular usado neste pedido.'
                        : `Enviamos seis números para ${phone}.`}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="hover:bg-surface-secondary focus-visible:ring-brand-500 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2"
                aria-label="Fechar"
              >
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            {step === 'identifier' && needsIdentifierInput ? (
              <label className="mt-5 block text-sm font-semibold">
                {isEmail ? 'Seu e-mail' : 'Celular'}
                {isEmail ? (
                  <Input
                    className="mt-1"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com"
                  />
                ) : (
                  <Input
                    className="mt-1"
                    autoComplete="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                    placeholder="(11) 99999-9999"
                  />
                )}
              </label>
            ) : step === 'code' ? (
              <label className="mt-5 block text-sm font-semibold">
                Código de confirmação
                <Input
                  className="mt-1 text-center font-mono text-xl tracking-[0.3em]"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))}
                  aria-describedby="consumer-code-help"
                />
                <span id="consumer-code-help" className="text-text-secondary mt-1 block text-xs">
                  Você pode colar o código recebido.
                </span>
              </label>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="bg-error-light text-error mt-3 rounded-lg p-3 text-sm font-semibold"
              >
                {error}
              </p>
            ) : null}
            <Button
              className="mt-5 w-full"
              disabled={
                pending ||
                (step === 'identifier' && needsIdentifierInput
                  ? isEmail
                    ? !email.trim() || email.length > 254
                    : phone.length < 14
                  : step === 'code'
                    ? code.length !== 6
                    : false)
              }
              onClick={step === 'identifier' ? requestCode : verifyCode}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : step === 'identifier' ? (
                isEmail ? (
                  <Mail aria-hidden="true" />
                ) : (
                  <MessageSquareText aria-hidden="true" />
                )
              ) : null}
              {pending
                ? 'Aguarde…'
                : step === 'identifier' && purpose === 'ORDER_CLAIM' && !isEmail
                  ? 'Tentar novamente'
                  : step === 'identifier'
                    ? isEmail
                      ? 'Enviar código'
                      : 'Continuar'
                    : 'Confirmar código'}
            </Button>
            {step === 'code' ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {needsIdentifierInput ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep('identifier');
                      setCode('');
                      setError(null);
                    }}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {isEmail ? 'Trocar e-mail' : 'Trocar número'}
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || remaining > 0}
                  onClick={resend}
                >
                  {remaining > 0 ? `Reenviar em ${remaining}s` : 'Reenviar código'}
                </Button>
              </div>
            ) : (
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" className="mt-2 w-full">
                  Voltar
                </Button>
              </Dialog.Close>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
