import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Pagamento por Pix' };

export default async function StorePixPage() {
  return redirectLegacyStoreRoute('payments');
}
