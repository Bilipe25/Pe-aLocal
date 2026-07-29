'use client';

import dynamic from 'next/dynamic';

import type { CheckoutFormProps } from '@/components/storefront/checkout-form';

const LazyCheckoutForm = dynamic<CheckoutFormProps>(
  () => import('@/components/storefront/checkout-form').then((module) => module.CheckoutForm),
  {
    loading: () => <CheckoutFormSkeleton />,
  },
);

export function CheckoutFormLoader(props: CheckoutFormProps) {
  return <LazyCheckoutForm {...props} />;
}

function CheckoutFormSkeleton() {
  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
      role="status"
      aria-label="Carregando checkout"
      aria-live="polite"
    >
      <div className="storefront-checkout-summary rounded-2xl p-4 sm:p-6">
        <div className="bg-tinta/8 h-5 w-36 animate-pulse rounded-md" />
        <div className="bg-tinta/8 mt-6 h-12 w-full animate-pulse rounded-xl" />
        <div className="bg-tinta/8 mt-4 h-12 w-full animate-pulse rounded-xl" />
        <div className="bg-tinta/8 mt-8 h-11 w-full animate-pulse rounded-xl" />
      </div>
      <div className="storefront-checkout-summary hidden h-56 rounded-2xl p-4 lg:block">
        <div className="bg-tinta/8 h-5 w-32 animate-pulse rounded-md" />
        <div className="bg-tinta/8 mt-5 h-24 w-full animate-pulse rounded-xl" />
      </div>
      <span className="sr-only">Carregando os dados para finalizar seu pedido.</span>
    </div>
  );
}
