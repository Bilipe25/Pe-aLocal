import Link from 'next/link';
import { Gift, PackageOpen, ShoppingCart, Tag, Truck } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Criar oferta' };

export default async function NewOfferPage() {
  await getOfferEditorProducts();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Criar oferta"
        description="Escolha um formato direto para o cardápio."
        backHref="/dashboard/offers"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            icon: PackageOpen,
            title: 'Montar um combo',
            description: 'Use uma composição fixa ou deixe o cliente escolher cada parte.',
            href: '/dashboard/offers/new/automatic?kind=COMBO_FLEXIBLE',
            action: 'Criar combo com escolhas',
          },
          {
            icon: Tag,
            title: 'Reduzir um produto',
            description: 'Aplique um preço promocional ao produto-base.',
            href: '/dashboard/offers/new/promotion',
            action: 'Criar promoção',
          },
          {
            icon: Gift,
            title: 'Incentivar quantidade',
            description: 'Configure “leve N por X” ou “compre e ganhe”.',
            href: '/dashboard/offers/new/automatic?kind=QUANTITY_FIXED_PRICE',
            action: 'Configurar quantidade',
          },
          {
            icon: ShoppingCart,
            title: 'Aumentar o carrinho',
            description: 'Dê um desconto automático acima de um valor mínimo.',
            href: '/dashboard/offers/new/automatic?kind=CART_FIXED_DISCOUNT',
            action: 'Configurar carrinho',
          },
          {
            icon: Truck,
            title: 'Oferecer entrega grátis',
            description: 'Remova a taxa de entrega quando o pedido atingir o mínimo.',
            href: '/dashboard/offers/new/automatic?kind=FREE_DELIVERY',
            action: 'Configurar entrega',
          },
        ].map((option) => (
          <section
            key={option.title}
            className="border-border bg-surface flex min-w-0 flex-col rounded-xl border p-5 sm:p-6"
          >
            <option.icon className="text-brand-600 h-7 w-7" aria-hidden="true" />
            <h2 className="text-text-primary mt-5 text-xl font-bold">{option.title}</h2>
            <p className="text-text-secondary mt-2 flex-1 text-sm">{option.description}</p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href={option.href}>{option.action}</Link>
            </Button>
          </section>
        ))}
      </div>
      <p className="text-text-secondary mt-5 text-center text-sm">
        Já sabe exatamente quais itens entram?{' '}
        <Link
          href="/dashboard/offers/new/combo"
          className="text-brand-700 font-semibold underline-offset-4 hover:underline"
        >
          Criar combo fixo
        </Link>
      </p>
    </div>
  );
}
