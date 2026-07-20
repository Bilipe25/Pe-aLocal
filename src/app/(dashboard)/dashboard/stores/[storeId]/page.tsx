import Link from 'next/link';
import { ArrowRight, Clock, CreditCard, MapPin, Settings, Store, Truck } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { ReadOnlyNotice } from '@/components/shared/read-only-notice';
import { StoreStatusControl } from '@/features/stores/components/store-status-control';
import { loadStorePageData } from '@/features/stores/page-access';
import { getStoreOverview } from '@/server/services/store-settings.service';

export const metadata = { title: 'Minha loja' };

const STATUS_MAP = {
  OPEN: { label: 'Aberta', variant: 'success' as const },
  CLOSED: { label: 'Fechada', variant: 'destructive' as const },
  PAUSED: { label: 'Pausada', variant: 'warning' as const },
};

export default async function StorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, capabilities } = await loadStorePageData(() => getStoreOverview(storeId));
  const status = STATUS_MAP[store.status];
  const basePath = `/dashboard/stores/${store.id}`;

  const links = [
    {
      title: 'Informações gerais',
      description: 'Nome, endereço público, descrição e contatos',
      href: `${basePath}/general`,
      icon: Settings,
      visible: capabilities.viewGeneral,
    },
    {
      title: 'Horários de funcionamento',
      description: 'Dias e horários em que a loja aceita pedidos',
      href: `${basePath}/hours`,
      icon: Clock,
      visible: capabilities.viewHours,
    },
    {
      title: 'Endereço',
      description: 'Endereço administrativo e referência da unidade',
      href: `${basePath}/address`,
      icon: MapPin,
      visible: capabilities.viewAddress,
    },
    {
      title: 'Pagamentos',
      description: 'Configuração do Pix da unidade',
      href: `${basePath}/payments`,
      icon: CreditCard,
      visible: capabilities.viewPayments,
    },
    {
      title: 'Operações',
      description: 'Pedido mínimo, prazo, entrega e retirada',
      href: `${basePath}/operations`,
      icon: Truck,
      visible: capabilities.viewOperations,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Minha loja"
        description="Controle o funcionamento e as configurações da unidade selecionada."
        backHref="/dashboard/stores"
      />

      <div className="border-border bg-surface mb-6 rounded-xl border p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <Store className="text-brand-600 h-5 w-5" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-text-primary truncate font-semibold">{store.name}</p>
            <p className="text-text-secondary truncate text-sm">/{store.slug}</p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="border-border mt-4 border-t pt-4">
          {capabilities.changeStatus ? (
            <StoreStatusControl
              storeId={store.id}
              status={store.status}
              expectedConfigurationVersion={store.configurationVersion}
            />
          ) : (
            <ReadOnlyNotice message="O status da unidade pode ser consultado acima, mas somente o proprietário pode alterá-lo." />
          )}
        </div>
      </div>

      <nav
        className="divide-border border-border bg-surface divide-y overflow-hidden rounded-xl border"
        aria-label="Configurações da unidade"
      >
        {links
          .filter((item) => item.visible)
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-surface-secondary flex min-h-20 items-center gap-3 p-4 transition-colors sm:px-5"
            >
              <span className="bg-brand-50 text-brand-700 rounded-lg p-2">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-text-primary font-semibold">{item.title}</span>
                <span className="text-text-secondary mt-0.5 block text-sm">{item.description}</span>
              </span>
              <ArrowRight className="text-text-muted shrink-0" aria-hidden="true" />
            </Link>
          ))}
      </nav>
    </div>
  );
}
