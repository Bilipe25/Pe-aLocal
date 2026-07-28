'use client';

import { Clock3 } from 'lucide-react';
import Link from 'next/link';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

const ExpireCustomerOrderAccessContext = createContext<() => void>(() => {});

export function useExpireCustomerOrderAccess() {
  return useContext(ExpireCustomerOrderAccessContext);
}

export function ExpiredOrderAccess({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="storefront-page-bottom-safe bg-papel min-h-screen">
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <div className="bg-kraft/50 text-text-muted flex h-14 w-14 items-center justify-center rounded-full">
          <Clock3 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-tinta mt-4 text-xl font-bold">
          Acompanhamento indisponível
        </h1>
        <p className="text-text-muted mt-2 max-w-sm text-sm">
          Por segurança, este link de acompanhamento não está mais disponível. Entre em contato com
          a loja se precisar consultar um pedido antigo.
        </p>
        <Link
          href={`/${storeSlug}`}
          className="storefront-primary-action mt-5 inline-flex min-h-11 items-center justify-center px-4 py-2 font-medium"
        >
          Voltar ao cardápio
        </Link>
      </main>
    </div>
  );
}

export function CustomerOrderAccessBoundary({
  storeSlug,
  children,
}: {
  storeSlug: string;
  children: ReactNode;
}) {
  const [expired, setExpired] = useState(false);
  const expireAccess = useCallback(() => setExpired(true), []);
  const contextValue = useMemo(() => expireAccess, [expireAccess]);

  if (expired) return <ExpiredOrderAccess storeSlug={storeSlug} />;

  return (
    <ExpireCustomerOrderAccessContext.Provider value={contextValue}>
      {children}
    </ExpireCustomerOrderAccessContext.Provider>
  );
}
