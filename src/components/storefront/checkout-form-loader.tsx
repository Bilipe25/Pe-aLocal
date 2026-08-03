'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import type {
  AutomaticRecognitionBootstrap,
  CheckoutFormProps,
} from '@/components/storefront/checkout-form';

type CheckoutFormLoaderProps = Omit<
  CheckoutFormProps,
  'automaticRecognitionBootstrap' | 'automaticRecognitionManaged'
>;

const automaticRecognitionRequests = new Map<string, Promise<unknown>>();

function startAutomaticRecognition(storeSlug: string) {
  const recognitionEndpoint = `/api/storefront/${encodeURIComponent(storeSlug)}/checkout/recognition`;
  const pendingRequest = automaticRecognitionRequests.get(recognitionEndpoint);
  if (pendingRequest) return pendingRequest;

  const request = fetch(recognitionEndpoint, {
    method: 'GET',
    cache: 'no-store',
  })
    .then(async (response) => (response.ok ? ((await response.json()) as unknown) : null))
    .catch(() => null)
    .finally(() => {
      if (automaticRecognitionRequests.get(recognitionEndpoint) === request) {
        automaticRecognitionRequests.delete(recognitionEndpoint);
      }
    });
  automaticRecognitionRequests.set(recognitionEndpoint, request);
  return request;
}

const LazyCheckoutForm = dynamic<CheckoutFormProps>(
  () => import('@/components/storefront/checkout-form').then((module) => module.CheckoutForm),
  {
    loading: () => <CheckoutFormSkeleton />,
  },
);

export function CheckoutFormLoader(props: CheckoutFormLoaderProps) {
  const [automaticRecognitionBootstrap, setAutomaticRecognitionBootstrap] =
    useState<AutomaticRecognitionBootstrap | null>(null);

  useEffect(() => {
    let active = true;
    const request = startAutomaticRecognition(props.storeSlug);
    queueMicrotask(() => {
      if (active) {
        setAutomaticRecognitionBootstrap({ storeSlug: props.storeSlug, request });
      }
    });
    void import('@/components/storefront/customer-recognition-dialog');
    return () => {
      active = false;
    };
  }, [props.storeSlug]);

  return (
    <LazyCheckoutForm
      {...props}
      automaticRecognitionManaged
      automaticRecognitionBootstrap={automaticRecognitionBootstrap}
    />
  );
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
