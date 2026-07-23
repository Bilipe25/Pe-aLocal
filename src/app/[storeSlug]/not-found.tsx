import type { Metadata } from 'next';

import { PublicNotFoundState } from '@/components/public-not-found-state';

export const metadata: Metadata = {
  title: 'Loja não encontrada',
  robots: { index: false, follow: false },
};

export default function StorefrontNotFound() {
  return <PublicNotFoundState />;
}
