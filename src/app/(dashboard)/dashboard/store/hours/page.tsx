import { redirectLegacyStoreRoute } from '@/features/stores/navigation';

export const metadata = { title: 'Horários de funcionamento' };

export default async function StoreHoursPage() {
  return redirectLegacyStoreRoute('hours');
}
