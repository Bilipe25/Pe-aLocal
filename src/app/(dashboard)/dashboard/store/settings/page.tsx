import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Entrega e retirada' };

export default async function StoreSettingsPage() {
  return redirectLegacyStoreRoute('operations');
}
