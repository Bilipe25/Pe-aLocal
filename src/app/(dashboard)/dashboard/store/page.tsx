import Link from 'next/link';
import { ArrowRight, Store, Clock, MapPin, CreditCard, Truck, Settings } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { Badge } from '@/components/ui/badge';
import { StoreStatusControl } from '@/features/stores/components/store-status-control';

export const metadata = { title: 'Minha loja' };

const STATUS_MAP = {
  OPEN: { label: 'Aberta', variant: 'success' as const },
  CLOSED: { label: 'Fechada', variant: 'destructive' as const },
  PAUSED: { label: 'Pausada', variant: 'warning' as const },
};

export default async function StorePage() {
  const store = await getStoreForDashboard();
  const status = STATUS_MAP[store.status];

  return (
    <div>
      <PageHeader
        title="Minha loja"
        description="Controle o funcionamento, os dados públicos e as formas de atendimento do estabelecimento."
      />

      {/* Status da loja */}
      <div className="mb-6 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <Store className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text-primary">{store.name}</p>
            <p className="truncate text-sm text-text-secondary">/{store.slug}</p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <StoreStatusControl status={store.status} />
        </div>
      </div>

      <nav className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" aria-label="Configurações da loja">
        {[
          {
            title: 'Informações gerais',
            description: 'Nome, endereço público, descrição e contatos',
            href: '/dashboard/store/general',
            icon: Settings,
          },
          {
            title: 'Horários de funcionamento',
            description: 'Dias e horários em que a loja aceita pedidos',
            href: '/dashboard/store/hours',
            icon: Clock,
          },
          {
            title: 'Endereço',
            description: 'Endereço do estabelecimento',
            href: '/dashboard/store/address',
            icon: MapPin,
          },
          {
            title: 'Pagamento por Pix',
            description: 'Chave exibida ao cliente e conferência do recebimento',
            href: '/dashboard/store/pix',
            icon: CreditCard,
          },
          {
            title: 'Entrega e retirada',
            description: 'Pedido mínimo, tempo estimado, modalidades',
            href: '/dashboard/store/settings',
            icon: Truck,
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-20 items-center gap-3 p-4 transition-colors hover:bg-surface-secondary sm:px-5"
          >
            <div className="rounded-lg bg-brand-50 p-2 text-brand-500">
              <item.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-0.5 text-sm text-text-secondary">{item.description}</p>
            </div>
            <ArrowRight className="shrink-0 text-text-muted" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
