'use client';

import { Globe2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  changeStoreDomainStatusAction,
  requestStoreDomainAction,
} from '@/features/domains/actions';
import { STORE_DOMAIN_STATUSES, type STORE_DOMAIN_TYPES } from '@/schemas/store-domain';

type DomainType = (typeof STORE_DOMAIN_TYPES)[number];
type DomainStatus = (typeof STORE_DOMAIN_STATUSES)[number];

export interface AdminStoreDomainItem {
  id: string;
  hostname: string;
  domainType: DomainType;
  status: DomainStatus;
  verificationToken: string;
  isPrimary: boolean;
  verifiedAt: string | null;
}

export function StoreDomainsManager({
  tenantId,
  storeId,
  storeSlug,
  initialDomains,
  customDomainEnabled,
}: {
  tenantId: string;
  storeId: string;
  storeSlug: string;
  initialDomains: AdminStoreDomainItem[];
  customDomainEnabled: boolean;
}) {
  const router = useRouter();
  const [hostname, setHostname] = useState(`${storeSlug}.pedidolocal.com.br`);
  const [domainType, setDomainType] = useState<DomainType>('SUBDOMAIN');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestDomain() {
    startTransition(async () => {
      const result = await requestStoreDomainAction(tenantId, storeId, { hostname, domainType });
      if (!result.success) {
        setFeedback(result.error.message);
        return;
      }
      setFeedback(
        'Solicitação registrada. Nenhum DNS ou certificado foi alterado automaticamente.',
      );
      router.refresh();
    });
  }

  function updateDomain(domainId: string, status: DomainStatus, isPrimary: boolean) {
    startTransition(async () => {
      const result = await changeStoreDomainStatusAction(tenantId, storeId, {
        domainId,
        status,
        isPrimary,
      });
      if (!result.success) {
        setFeedback(result.error.message);
        return;
      }
      setFeedback('Status atualizado manualmente e auditado.');
      router.refresh();
    });
  }

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Globe2 className="text-brand-500 h-5 w-5" />
        <h2 className="text-text-primary text-lg font-semibold">7. Domínios</h2>
      </div>
      <p className="text-text-secondary mt-1 text-sm">
        Registro e verificação manuais. Cloudflare for SaaS, DNS e certificados não são
        automatizados.
      </p>
      <div className="border-border mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-[12rem_1fr_auto]">
        <select
          value={domainType}
          onChange={(event) => {
            const next = event.target.value as DomainType;
            setDomainType(next);
            setHostname(next === 'SUBDOMAIN' ? `${storeSlug}.pedidolocal.com.br` : '');
          }}
          className="border-border rounded-md border px-3 py-2 text-sm"
        >
          <option value="SUBDOMAIN">Subdomínio</option>
          <option value="CUSTOM" disabled={!customDomainEnabled}>
            Domínio personalizado
          </option>
        </select>
        <input
          value={hostname}
          readOnly={domainType === 'SUBDOMAIN'}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="cardapio.exemplo.com.br"
          className="border-border rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={isPending || !hostname}
          onClick={requestDomain}
          className="bg-brand-500 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Registrar
        </button>
      </div>
      {feedback && (
        <p className="bg-info-light text-info mt-3 rounded-md p-3 text-sm">{feedback}</p>
      )}
      <div className="mt-4 space-y-3">
        {initialDomains.map((domain) => (
          <article key={domain.id} className="border-border rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-text-primary font-medium">{domain.hostname}</p>
                <p className="text-text-muted text-xs">
                  {domain.domainType} · token TXT: {domain.verificationToken}
                </p>
              </div>
              {domain.isPrimary && (
                <span className="bg-success-light text-success rounded-full px-2 py-1 text-xs">
                  Canônico primário
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                key={`${domain.id}-${domain.status}-${domain.isPrimary}`}
                defaultValue={domain.status}
                disabled={isPending}
                onChange={(event) =>
                  updateDomain(domain.id, event.target.value as DomainStatus, false)
                }
                className="border-border rounded-md border px-2 py-1.5 text-sm"
              >
                {STORE_DOMAIN_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              {domain.status === 'ACTIVE' && !domain.isPrimary && (
                <button
                  type="button"
                  onClick={() => updateDomain(domain.id, 'ACTIVE', true)}
                  className="border-border rounded-md border px-3 py-1.5 text-sm"
                >
                  Tornar primário
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
