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
    connection: {
      status: 'ACTIVE' | 'REAUTH_REQUIRED' | 'DISCONNECTED' | 'REVOKED' | 'ERROR';
      liveMode: boolean;
      connectedAt: Date | null;
      refreshedAt: Date | null;
      reauthRequiredAt: Date | null;
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
  connected: 'Conta Mercado Pago conectada com sucesso. Agora você pode ativar o modo Online.',
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
            Pagamento do checkout
          </h2>
          <p className="text-text-secondary mt-0.5 text-sm">
            Escolha entre a confirmação manual atual e o Pix com confirmação automática.
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
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modo de pagamento">
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
                    {option === 'MANUAL' ? 'Manual' : 'Online'}
                  </span>
                  <span className="text-text-secondary mt-1 block text-sm">
                    {option === 'MANUAL'
                      ? 'A loja confere e confirma o pagamento.'
                      : 'Pix Mercado Pago com confirmação automática.'}
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
                ? 'O modo Online continua salvo, mas o checkout está usando o modo Manual até a conta ser reconectada.'
                : 'Conecte uma conta Mercado Pago para habilitar e selecionar o modo Online.'}
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
            </div>
            <p className="text-text-secondary mt-1 text-sm">
              O valor é recebido diretamente na conta conectada pela loja.
            </p>
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
