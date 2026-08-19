'use client';

import { CircleAlert, CheckCircle2, Link2, Link2Off, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { FormMessage } from '@/components/shared/form-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  connectMercadoPagoAction,
  disconnectMercadoPagoAction,
  updateStorePaymentModeAction,
} from '@/features/stores/payment-provider-actions';
import type { MercadoPagoConnectionFeedback } from '@/lib/mercado-pago/oauth-feedback';

interface OnlinePaymentSettingsProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly: boolean;
  connectionFeedback: MercadoPagoConnectionFeedback | null;
  capability: {
    mode: 'MANUAL' | 'ONLINE';
    effectiveMode: 'MANUAL' | 'ONLINE';
    canSelectOnline: boolean;
    environment: 'sandbox' | 'production';
    connection: {
      status: 'ACTIVE' | 'REAUTH_REQUIRED' | 'DISCONNECTED' | 'REVOKED' | 'ERROR';
      liveMode: boolean;
      connectedAt: Date | null;
      refreshedAt: Date | null;
      reauthRequiredAt: Date | null;
    } | null;
    paymentHealth?: {
      status: 'DEGRADED';
      failedCharges: number;
      lastFailureAt: Date;
    } | null;
  };
}

const statusLabel = {
  ACTIVE: 'Conta conectada',
  REAUTH_REQUIRED: 'Reconexão necessária',
  DISCONNECTED: 'Conta desconectada',
  REVOKED: 'Acesso revogado',
  ERROR: 'Conexão indisponível',
} as const;

const connectionFeedbackMessage: Record<MercadoPagoConnectionFeedback, string> = {
  connected: 'Conta Mercado Pago conectada com sucesso. Agora você pode ativar o Pix automático.',
  error: 'Não foi possível conectar a conta. Inicie uma nova tentativa.',
  invalid_grant:
    'A autorização expirou ou não corresponde a esta integração. Inicie uma nova conexão.',
  invalid_client:
    'A configuração da integração precisa ser revisada pelo suporte antes de conectar.',
  invalid_scope:
    'O Mercado Pago não aceitou as permissões solicitadas. Revise a aplicação antes de tentar novamente.',
  rate_limited: 'O Mercado Pago limitou temporariamente as tentativas. Aguarde e tente novamente.',
  provider_error: 'O Mercado Pago não conseguiu concluir a autorização. Inicie uma nova tentativa.',
  invalid_response:
    'O Mercado Pago retornou uma resposta inesperada. Tente novamente; se persistir, acione o suporte.',
  environment_mismatch:
    'O staging aceita apenas uma conta Mercado Pago de teste. Conecte um usuário de teste do tipo Vendedor.',
  unsupported_credential:
    'Essa credencial não funciona com o Pix pela Orders API. Reconecte usando um usuário Vendedor de teste do Mercado Pago.',
  missing_scope:
    'A conta não concedeu todas as permissões necessárias. Autorize leitura e escrita em uma nova tentativa.',
  internal_error: 'A conexão não pôde ser salva. Tente novamente; se persistir, acione o suporte.',
};

export function OnlinePaymentSettings({
  storeId,
  expectedConfigurationVersion,
  readOnly,
  connectionFeedback,
  capability,
}: OnlinePaymentSettingsProps) {
  const router = useRouter();
  const [mode, setMode] = useState(capability.mode);
  const [configurationVersion, setConfigurationVersion] = useState(expectedConfigurationVersion);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const connection = capability.connection;
  const paymentDegraded =
    connection?.status === 'ACTIVE' && capability.paymentHealth?.status === 'DEGRADED';

  const changeMode = (nextMode: 'MANUAL' | 'ONLINE') => {
    if (nextMode === mode) return;
    setError(null);
    startTransition(async () => {
      const result = await updateStorePaymentModeAction(storeId, configurationVersion, nextMode);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setMode(nextMode);
      setConfigurationVersion(result.data.configurationVersion);
      router.refresh();
    });
  };

  const disconnect = () => {
    if (
      !window.confirm(
        'Desconectar a conta Mercado Pago? Novos checkouts usarão os métodos manuais. Pagamentos já criados continuarão sendo conciliados.',
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await disconnectMercadoPagoAction(storeId, configurationVersion);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setMode('MANUAL');
      setConfigurationVersion(result.data.configurationVersion);
      router.refresh();
    });
  };

  return (
    <section
      className="border-border bg-surface mb-5 overflow-hidden rounded-xl border"
      aria-labelledby="online-payment-heading"
    >
      <header className="border-border bg-surface-secondary/40 flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
        <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="online-payment-heading" className="text-text-primary font-semibold">
            Confirmação do Pix
          </h2>
          <p className="text-text-secondary mt-0.5 text-sm">
            Dinheiro e cartão no recebimento continuam disponíveis conforme a configuração da loja.
          </p>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        <FormMessage message={error} />
        {connectionFeedback ? (
          <div
            role={connectionFeedback === 'connected' ? 'status' : 'alert'}
            className={`${connectionFeedback === 'connected' ? 'bg-success-light text-success' : 'bg-error-light text-error'} flex items-start gap-2 rounded-lg px-3 py-2 text-sm`}
          >
            {connectionFeedback === 'connected' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <p className="font-medium">{connectionFeedbackMessage[connectionFeedback]}</p>
          </div>
        ) : null}
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Confirmação do Pix"
        >
          {(['MANUAL', 'ONLINE'] as const).map((option) => {
            const selected = mode === option;
            const disabled =
              readOnly || isPending || (option === 'ONLINE' && !capability.canSelectOnline);
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby={
                  option === 'ONLINE' && !capability.canSelectOnline
                    ? 'online-mode-requirement'
                    : undefined
                }
                disabled={disabled}
                onClick={() => changeMode(option)}
                className="border-border bg-surface hover:border-brand-300 disabled:bg-surface-secondary/50 disabled:text-text-muted flex min-h-20 items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  {selected ? <CheckCircle2 className="text-brand-600 size-5" /> : null}
                </span>
                <span>
                  <span className="text-text-primary block font-semibold">
                    {option === 'MANUAL' ? 'Pix manual' : 'Pix automático'}
                  </span>
                  <span className="text-text-secondary mt-1 block text-sm">
                    {option === 'MANUAL'
                      ? 'A loja exibe a própria chave e confere o pagamento.'
                      : 'O Mercado Pago gera a cobrança e confirma o Pix automaticamente.'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {!capability.canSelectOnline ? (
          <p
            id="online-mode-requirement"
            className="bg-info-light text-info flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {capability.mode === 'ONLINE' && capability.effectiveMode === 'MANUAL'
                ? 'O Pix automático continua salvo, mas o checkout usa o Pix manual até a conta ser reconectada.'
                : 'Conecte uma conta Mercado Pago para habilitar o Pix automático.'}
            </span>
          </p>
        ) : null}

        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-text-primary font-semibold">Conta Mercado Pago</p>
              {connection ? (
                <Badge variant={connection.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {statusLabel[connection.status]}
                </Badge>
              ) : (
                <Badge variant="secondary">Não conectada</Badge>
              )}
              {connection?.status === 'ACTIVE' ? (
                <Badge variant="secondary">
                  {capability.environment === 'sandbox'
                    ? 'Ambiente de teste'
                    : 'Ambiente de produção'}
                </Badge>
              ) : null}
              {paymentDegraded ? <Badge variant="warning">Cobranças com falha</Badge> : null}
            </div>
            <p className="text-text-secondary mt-1 text-sm">
              O valor é recebido diretamente na conta conectada pela loja.
            </p>
            {connection?.status === 'ACTIVE' ? (
              <div className="mt-2 grid gap-1 text-sm" aria-label="Verificações da integração">
                <span className="text-success flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Conta conectada
                </span>
                <span
                  className={
                    capability.canSelectOnline && !paymentDegraded
                      ? 'text-success flex items-center gap-1.5'
                      : 'text-warning flex items-center gap-1.5'
                  }
                >
                  {capability.canSelectOnline && !paymentDegraded ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="size-4" aria-hidden="true" />
                  )}
                  {paymentDegraded
                    ? 'Conta conectada, mas as cobranças recentes estão falhando'
                    : capability.canSelectOnline
                      ? 'Conta pronta para receber Pix'
                      : 'Conta conectada, mas o Pix online ainda não está disponível'}
                </span>
              </div>
            ) : null}
            {paymentDegraded && capability.paymentHealth ? (
              <div
                role="alert"
                className="bg-warning-light text-warning mt-3 flex max-w-2xl items-start gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  {capability.paymentHealth.failedCharges === 1
                    ? 'Uma cobrança recente falhou.'
                    : `${capability.paymentHealth.failedCharges} cobranças recentes falharam.`}{' '}
                  Faça um Pix de teste com dados válidos. Se continuar, use o Pix manual e acione o
                  suporte.
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {connection?.status === 'ACTIVE' ? (
              <Button
                type="button"
                variant="outline"
                disabled={readOnly || isPending}
                onClick={disconnect}
              >
                <Link2Off aria-hidden="true" /> Desconectar
              </Button>
            ) : (
              <form action={connectMercadoPagoAction.bind(null, storeId)}>
                <Button type="submit" disabled={readOnly || isPending}>
                  {connection ? <RefreshCw aria-hidden="true" /> : <Link2 aria-hidden="true" />}
                  {connection ? 'Reconectar' : 'Conectar conta Mercado Pago'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
