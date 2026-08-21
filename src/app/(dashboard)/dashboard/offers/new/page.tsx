import Link from 'next/link';
import { PackageOpen, Tag } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getOfferEditorProducts } from '@/server/services/offer.service';

export const metadata = { title: 'Criar oferta' };

export default async function NewOfferPage() {
  await getOfferEditorProducts();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Criar oferta" description="Escolha um formato direto para o cardápio." backHref="/dashboard/offers" />
      <div className="border-border bg-surface divide-border overflow-hidden rounded-xl border sm:grid sm:grid-cols-2 sm:divide-x">
        <section className="p-5 sm:p-7">
          <PackageOpen className="text-brand-600 h-7 w-7" aria-hidden="true" />
          <h2 className="text-text-primary mt-5 text-xl font-bold">Combo</h2>
          <p className="text-text-secondary mt-2 min-h-16 text-sm">Agrupe dois ou mais produtos existentes e publique um preço especial para a soma dos itens-base.</p>
          <Button asChild className="mt-6 w-full"><Link href="/dashboard/offers/new/combo">Criar combo</Link></Button>
        </section>
        <section className="border-border border-t p-5 sm:border-t-0 sm:p-7">
          <Tag className="text-brand-600 h-7 w-7" aria-hidden="true" />
          <h2 className="text-text-primary mt-5 text-xl font-bold">Promoção de produto</h2>
          <p className="text-text-secondary mt-2 min-h-16 text-sm">Aplique um preço promocional ao produto-base dentro de uma agenda simples.</p>
          <Button asChild variant="outline" className="mt-6 w-full"><Link href="/dashboard/offers/new/promotion">Criar promoção</Link></Button>
        </section>
      </div>
    </div>
  );
}
