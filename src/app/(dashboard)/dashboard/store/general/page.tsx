import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Informações gerais' };

export default async function StoreGeneralPage() {
  return redirectLegacyStoreRoute('general');
}
