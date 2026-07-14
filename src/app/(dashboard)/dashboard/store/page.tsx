import Link from 'next/link';
import { Store, Clock, MapPin, CreditCard, Truck, Settings } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { getStoreForDashboard } from '@/features/stores/actions';
import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'Configurações da Loja' };

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
        title="Configurações da Loja"
        description="Gerencie as informações e configurações do seu estabelecimento."
        backHref="/dashboard"
      />

      {/* Status da loja */}
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <Store className="h-5 w-5 text-brand-500" />
        <div className="flex-1">
          <p className="font-semibold text-text-primary">{store.name}</p>
          <p className="text-sm text-text-secondary">/{store.slug}</p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {/* Cards de navegação */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            title: 'Informações Gerais',
            description: 'Nome, slug, descrição, telefone, WhatsApp',
            href: '/dashboard/store/general',
            icon: Settings,
          },
          {
            title: 'Horários de Funcionamento',
            description: 'Configure os dias e horários da loja',
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
            title: 'Configuração de Pix',
            description: 'Chave Pix e informações de recebimento',
            href: '/dashboard/store/pix',
            icon: CreditCard,
          },
          {
            title: 'Entrega e Retirada',
            description: 'Pedido mínimo, tempo estimado, modalidades',
            href: '/dashboard/store/settings',
            icon: Truck,
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md"
          >
            <div className="rounded-lg bg-brand-50 p-2 text-brand-500">
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">{item.title}</h3>
              <p className="mt-0.5 text-sm text-text-secondary">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
