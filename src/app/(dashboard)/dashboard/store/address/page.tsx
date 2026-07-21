import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Endereço' };

export default async function StoreAddressPage() {
  return redirectLegacyStoreRoute('address');
}
