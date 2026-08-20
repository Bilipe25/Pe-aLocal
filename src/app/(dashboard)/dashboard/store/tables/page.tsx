import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Mesas e QR Code' };

export default async function LegacyDiningTablesPage() {
  return redirectLegacyStoreRoute('tables');
}
