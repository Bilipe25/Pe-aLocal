import { CircleCheckBig, Utensils } from 'lucide-react';

import { DiningSessionActions } from '@/components/storefront/dining-session-actions';
import { DineInUnavailable } from '@/components/storefront/dine-in-unavailable';
import { getPublicDiningSession } from '@/server/services/dining-table-session.service';

export const dynamic = 'force-dynamic';

export default async function PublicDiningSessionPage({
  params,
}: {
  params: Promise<{ sessionToken: string }>;
}) {
  const { sessionToken } = await params;
  const session = await getPublicDiningSession(sessionToken);
  if (session.state === 'INVALID') return <DineInUnavailable state="INVALID" />;
  if (session.state === 'CLOSED') {
    return (
      <main className="dining-session-public dining-session-public-closed">
        <CircleCheckBig aria-hidden="true" />
        <p className="dine-in-table-chip">
          <Utensils aria-hidden="true" /> {session.tableLabel}
        </p>
        <h1>Atendimento encerrado</h1>
        <p>Obrigado pela visita. Para iniciar um novo pedido, escaneie o QR Code da mesa.</p>
      </main>
    );
  }

  return (
    <main className="dining-session-public">
      <p className="dine-in-table-chip">
        <Utensils aria-hidden="true" /> Você está na {session.tableLabel}
      </p>
      <p className="dining-session-store-name">{session.storeName}</p>
      <h1>Seu atendimento continua aqui</h1>
      <p>Peça mais alguma coisa ou avise a equipe quando precisar.</p>
      <DiningSessionActions
        sessionToken={sessionToken}
        continueOrderingHref={session.continueOrderingHref!}
        assistanceRequested={session.assistanceRequested}
        billRequested={session.billRequested}
        publicOperationsEnabled={session.publicOperationsEnabled}
      />
    </main>
  );
}
