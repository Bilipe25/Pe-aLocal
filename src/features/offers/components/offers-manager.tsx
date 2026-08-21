'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, Eye, Pause, Pencil, Play, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  archiveComboAction,
  archiveCanonicalOfferAction,
  archiveProductPromotionAction,
  setOfferActiveAction,
} from '@/features/offers/actions';
import { formatCurrency } from '@/lib/utils';

interface ScheduleData {
  startsOn: string | null;
  endsOnExclusive: string | null;
  weekdays: string[];
  startMinute: number | null;
  endMinuteExclusive: number | null;
}

export type OfferListItem = (
  | {
      kind: 'COMBO';
      id: string;
      version: number;
      name: string;
      isActive: boolean;
      archivedAt: string | null;
      activeNow: boolean;
      regularPrice: number;
      offerPrice: number;
      schedule: ScheduleData;
      componentCount: number;
    }
  | {
      kind: 'PRODUCT_PROMOTION';
      id: string;
      version: number;
      name: string;
      isActive: boolean;
      archivedAt: string | null;
      activeNow: boolean;
      regularPrice: number;
      offerPrice: number;
      schedule: ScheduleData;
    }
  | {
      kind: 'CANONICAL';
      id: string;
      version: number;
      name: string;
      isActive: boolean;
      archivedAt: string | null;
      activeNow: boolean;
      technicalKind: string;
      legacyKind: 'COMBO' | 'PRODUCT_PROMOTION' | null;
      typeLabel: string;
      benefitLabel: string;
      schedule: ScheduleData;
    }
) & {
  performance?: {
    orderCount: number;
    grossRevenue: number;
    discountAmount: number;
    averageTicket: number;
  };
};

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'seg',
  TUESDAY: 'ter',
  WEDNESDAY: 'qua',
  THURSDAY: 'qui',
  FRIDAY: 'sex',
  SATURDAY: 'sáb',
  SUNDAY: 'dom',
};

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function scheduleLabel(schedule: ScheduleData) {
  const parts: string[] = [];
  if (schedule.startsOn || schedule.endsOnExclusive) {
    parts.push(
      `${schedule.startsOn ? new Date(`${schedule.startsOn}T12:00:00Z`).toLocaleDateString('pt-BR') : 'agora'}–${schedule.endsOnExclusive ? new Date(`${schedule.endsOnExclusive}T12:00:00Z`).toLocaleDateString('pt-BR') : 'sem fim'}`,
    );
  }
  if (schedule.weekdays.length > 0) {
    parts.push(schedule.weekdays.map((day) => DAY_LABELS[day] ?? day).join(', '));
  }
  if (schedule.startMinute != null && schedule.endMinuteExclusive != null) {
    parts.push(
      `${formatMinute(schedule.startMinute)}–${formatMinute(schedule.endMinuteExclusive)}`,
    );
  }
  return parts.join(' · ') || 'Sempre disponível';
}

function status(offer: OfferListItem) {
  if (offer.archivedAt) return { label: 'Arquivada', variant: 'secondary' as const };
  if (!offer.isActive) return { label: 'Pausada', variant: 'warning' as const };
  if (offer.activeNow) return { label: 'Ativa agora', variant: 'success' as const };
  return { label: 'Agendada', variant: 'outline' as const };
}

export function OffersManager({
  offers,
  canEdit,
  page,
  totalPages,
  total,
}: {
  offers: OfferListItem[];
  canEdit: boolean;
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();

  async function toggle(offer: OfferListItem) {
    const actionKind = offer.kind === 'CANONICAL' ? (offer.legacyKind ?? offer.kind) : offer.kind;
    const result = await setOfferActiveAction(actionKind, offer.id, offer.version, !offer.isActive);
    if (!result.success) return toast.error(result.error.message);
    toast.success(offer.isActive ? 'Oferta pausada.' : 'Oferta ativada.');
    router.refresh();
  }

  async function archive(offer: OfferListItem) {
    if (offer.kind === 'CANONICAL' && offer.legacyKind === 'COMBO') {
      const result = await archiveComboAction(offer.id, offer.version);
      if (!result.success) {
        toast.error(result.error.message);
        return false;
      }
      toast.success('Oferta arquivada.');
      router.refresh();
      return true;
    }
    if (offer.kind === 'CANONICAL' && offer.legacyKind === 'PRODUCT_PROMOTION') {
      const result = await archiveProductPromotionAction(offer.id, offer.version);
      if (!result.success) {
        toast.error(result.error.message);
        return false;
      }
      toast.success('Oferta arquivada.');
      router.refresh();
      return true;
    }
    const result =
      offer.kind === 'COMBO'
        ? await archiveComboAction(offer.id, offer.version)
        : offer.kind === 'PRODUCT_PROMOTION'
          ? await archiveProductPromotionAction(offer.id, offer.version)
          : await archiveCanonicalOfferAction(offer.id, offer.version);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    toast.success('Oferta arquivada.');
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary text-sm">
          {total} {total === 1 ? 'oferta cadastrada' : 'ofertas cadastradas'} nesta loja.
        </p>
        {canEdit && (
          <Button asChild>
            <Link href="/dashboard/offers/new">
              <Plus aria-hidden="true" /> Criar oferta
            </Link>
          </Button>
        )}
      </div>
      {!canEdit && (
        <div className="border-info/25 bg-info-light text-text-primary flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Eye className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Seu perfil pode consultar ofertas. Proprietários e gerentes podem publicar ou alterar.
          </p>
        </div>
      )}
      {offers.length === 0 ? (
        <EmptyState
          icon={<Tag aria-hidden="true" />}
          title="Nenhuma oferta cadastrada"
          description={
            canEdit
              ? 'Publique um combo ou aplique um preço promocional a um produto.'
              : 'Ainda não há ofertas para consultar.'
          }
        />
      ) : (
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          <div className="text-text-secondary border-border hidden grid-cols-[minmax(13rem,1.5fr)_8rem_10rem_minmax(13rem,1fr)_8rem_auto] gap-4 border-b px-4 py-3 text-xs font-semibold tracking-wide lg:grid">
            <span>Oferta</span>
            <span>Tipo</span>
            <span>Preço</span>
            <span>Agenda</span>
            <span>Status</span>
            <span className="sr-only">Ações</span>
          </div>
          {offers.map((offer) => {
            const currentStatus = status(offer);
            const editHref =
              offer.kind === 'COMBO' || (offer.kind === 'CANONICAL' && offer.legacyKind === 'COMBO')
                ? `/dashboard/offers/combos/${offer.id}`
                : offer.kind === 'PRODUCT_PROMOTION' ||
                    (offer.kind === 'CANONICAL' && offer.legacyKind === 'PRODUCT_PROMOTION')
                  ? `/dashboard/offers/promotions/${offer.id}`
                  : null;
            return (
              <article
                key={`${offer.kind}-${offer.id}`}
                className="border-border grid gap-3 border-b p-4 last:border-b-0 lg:grid-cols-[minmax(13rem,1.5fr)_8rem_10rem_minmax(13rem,1fr)_8rem_auto] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <h2 className="text-text-primary truncate font-semibold">{offer.name}</h2>
                  <p className="text-success mt-1 text-sm font-medium">
                    {offer.kind === 'CANONICAL'
                      ? offer.benefitLabel
                      : `Economia de ${formatCurrency(Math.max(0, offer.regularPrice - offer.offerPrice))}`}
                  </p>
                  {offer.performance && (
                    <p className="text-text-secondary mt-1 text-xs">
                      {offer.performance.orderCount}{' '}
                      {offer.performance.orderCount === 1 ? 'pedido' : 'pedidos'} ·{' '}
                      {formatCurrency(offer.performance.grossRevenue)} em pedidos ·{' '}
                      {formatCurrency(offer.performance.discountAmount)} concedidos
                    </p>
                  )}
                </div>
                <p className="text-text-secondary text-sm">
                  {offer.kind === 'COMBO'
                    ? `Combo · ${offer.componentCount} itens`
                    : offer.kind === 'CANONICAL'
                      ? offer.typeLabel
                      : 'Promoção'}
                </p>
                <div className="text-sm">
                  {offer.kind === 'CANONICAL' ? (
                    <span className="text-text-primary font-semibold">Automática</span>
                  ) : (
                    <>
                      <span className="text-text-muted block line-through">
                        {formatCurrency(offer.regularPrice)}
                      </span>
                      <span className="text-text-primary font-semibold">
                        {formatCurrency(offer.offerPrice)}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-text-secondary text-sm">{scheduleLabel(offer.schedule)}</p>
                <div>
                  <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
                </div>
                {canEdit && !offer.archivedAt ? (
                  <div className="flex flex-wrap gap-1 lg:justify-end">
                    {editHref && (
                      <Button asChild type="button" variant="ghost" size="icon">
                        <Link href={editHref} aria-label={`Editar ${offer.name}`}>
                          <Pencil aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => toggle(offer)}
                      aria-label={offer.isActive ? `Pausar ${offer.name}` : `Ativar ${offer.name}`}
                    >
                      {offer.isActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                    </Button>
                    <ConfirmDialog
                      title={`Arquivar “${offer.name}”?`}
                      description="A oferta sai da vitrine, mas pedidos anteriores preservam seus valores e componentes."
                      confirmLabel="Arquivar oferta"
                      onConfirm={() => archive(offer)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Arquivar ${offer.name}`}
                        >
                          <Archive aria-hidden="true" />
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <span />
                )}
              </article>
            );
          })}
        </div>
      )}
      {totalPages > 1 && (
        <nav
          aria-label="Paginação de ofertas"
          className="flex items-center justify-between gap-3 pt-2"
        >
          <Button asChild={page > 1} variant="outline" disabled={page <= 1}>
            {page > 1 ? (
              <Link href={`/dashboard/offers?page=${page - 1}`}>Anterior</Link>
            ) : (
              'Anterior'
            )}
          </Button>
          <p className="text-text-secondary text-sm">
            Página {page} de {totalPages}
          </p>
          <Button asChild={page < totalPages} variant="outline" disabled={page >= totalPages}>
            {page < totalPages ? (
              <Link href={`/dashboard/offers?page=${page + 1}`}>Próxima</Link>
            ) : (
              'Próxima'
            )}
          </Button>
        </nav>
      )}
    </div>
  );
}
