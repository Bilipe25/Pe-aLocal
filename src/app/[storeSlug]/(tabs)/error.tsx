'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function StorefrontTabsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { storeSlug } = useParams<{ storeSlug: string }>();

  return (
    <main className="storefront-tab-error storefront-page-bottom-safe">
      <h1>Não foi possível abrir esta área</h1>
      <p>Sua navegação continua disponível. Tente novamente ou volte ao cardápio.</p>
      <div className="storefront-tab-error-actions">
        <button type="button" onClick={reset}>
          Tentar novamente
        </button>
        <Link href={`/${storeSlug}`}>Voltar ao cardápio</Link>
      </div>
    </main>
  );
}
