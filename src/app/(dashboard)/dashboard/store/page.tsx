import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Minha loja' };

export default async function StorePage() {
  return redirectLegacyStoreRoute();
}
