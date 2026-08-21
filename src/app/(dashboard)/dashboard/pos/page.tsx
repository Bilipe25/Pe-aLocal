import { PosWorkspace } from '@/features/pos/components/pos-workspace';
import { getPosWorkspace } from '@/server/services/pos-order.service';

export const metadata = { title: 'PDV — Novo pedido' };

export default async function PosPage() {
  const workspace = await getPosWorkspace();
  return <PosWorkspace initialData={workspace} />;
}
