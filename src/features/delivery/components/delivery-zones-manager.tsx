'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn, formatCurrency } from '@/lib/utils';
import { deleteDeliveryZoneAction } from '@/features/delivery/actions';
import { DeliveryZoneForm, type DeliveryZoneData } from './delivery-zone-form';

type DeliveryZoneEditor = DeliveryZoneData | 'new' | null;

function formatPostalCode(value: string) {
  return value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DeliveryZonesManager({
  zones,
  canEdit,
  deliveryEnabled,
  operationSettingsHref,
}: {
  zones: DeliveryZoneData[];
  canEdit: boolean;
  deliveryEnabled: boolean;
  operationSettingsHref: string;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<DeliveryZoneEditor>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const summary = useMemo(() => {
    const activeZones = zones.filter((zone) => zone.isActive);
    const activeRanges = activeZones.reduce((total, zone) => total + zone.postalRanges.length, 0);
    const fees = activeZones.map((zone) => zone.fee);
    return {
      activeZones: activeZones.length,
      activeRanges,
      minimumFee: fees.length ? Math.min(...fees) : null,
      checkoutReady: deliveryEnabled && activeRanges > 0,
      nextSortOrder: Math.min(
        10_000,
        zones.reduce((highest, zone) => Math.max(highest, zone.sortOrder), -1) + 1,
      ),
    };
  }, [deliveryEnabled, zones]);

  async function handleDelete(zone: DeliveryZoneData) {
    const result = await deleteDeliveryZoneAction(zone.id, zone.updatedAt);
    if (!result.success) {
      toast.error(result.error.message);
      if (result.error.code === 'CONCURRENCY_CONFLICT') router.refresh();
      return false;
    }
    toast.success(`Região “${zone.name}” excluída.`);
    router.refresh();
    return true;
  }

  const editorZone = editor === 'new' || editor === null ? undefined : editor;
  const editorOpen = editor !== null;

  function openEditor(nextEditor: Exclude<DeliveryZoneEditor, null>) {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setEditor(nextEditor);
  }

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="delivery-coverage-heading"
        className="border-border bg-surface overflow-hidden rounded-xl border"
      >
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="delivery-coverage-heading"
                className="text-text-primary text-lg font-semibold"
              >
                Cobertura de entrega
              </h2>
              <Badge
                variant={
                  summary.checkoutReady ? 'success' : deliveryEnabled ? 'warning' : 'secondary'
                }
              >
                {summary.checkoutReady
                  ? 'Disponível no checkout'
                  : deliveryEnabled
                    ? 'Cobertura incompleta'
                    : 'Entrega desativada'}
              </Badge>
            </div>
            <p className="text-text-secondary mt-1 hidden max-w-2xl text-sm text-pretty sm:block">
              As regiões ativas determinam a taxa, o pedido mínimo e o prazo confirmados no
              checkout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Link
              href={operationSettingsHref}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              aria-label="Configurar operação da loja"
            >
              <Settings2 aria-hidden="true" />
              <span className="hidden min-[360px]:inline">Configurar operação</span>
            </Link>
            {canEdit ? (
              <Button type="button" size="sm" onClick={() => openEditor('new')}>
                <Plus aria-hidden="true" /> Nova região
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="border-border bg-surface-secondary grid grid-cols-3 border-t">
          <div className="border-border min-w-0 border-r px-4 py-3">
            <dt className="text-text-secondary text-xs">Regiões ativas</dt>
            <dd className="text-text-primary mt-0.5 font-semibold">
              {summary.activeZones} de {zones.length}
            </dd>
          </div>
          <div className="border-border min-w-0 border-r px-3 py-3 sm:px-4">
            <dt className="text-text-secondary text-xs">Faixas atendidas</dt>
            <dd className="text-text-primary mt-0.5 font-semibold">{summary.activeRanges}</dd>
          </div>
          <div className="min-w-0 px-3 py-3 sm:px-4">
            <dt className="text-text-secondary text-xs">Taxa a partir de</dt>
            <dd className="text-text-primary mt-0.5 font-mono font-semibold">
              {summary.minimumFee == null ? '—' : formatCurrency(summary.minimumFee)}
            </dd>
          </div>
        </dl>
      </section>

      {!deliveryEnabled ? (
        <div className="border-warning/30 bg-warning-light text-text-primary flex items-start gap-3 rounded-xl border p-3 text-sm">
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            As regiões estão preservadas, mas a entrega está desativada. Ative-a em{' '}
            <Link
              href={operationSettingsHref}
              className="font-semibold underline underline-offset-2"
            >
              Configurar operação
            </Link>{' '}
            para disponibilizá-la no checkout.
          </p>
        </div>
      ) : deliveryEnabled && summary.activeRanges === 0 ? (
        <div className="border-warning/30 bg-warning-light text-text-primary flex items-start gap-3 rounded-xl border p-3 text-sm">
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            A entrega está habilitada, mas nenhuma faixa ativa pode ser usada. O checkout manterá
            somente as modalidades válidas até a cobertura ser configurada.
          </p>
        </div>
      ) : null}

      {!canEdit ? (
        <div className="border-info/25 bg-info-light text-text-primary flex items-start gap-3 rounded-xl border p-3 text-sm">
          <Eye className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Seu perfil pode consultar regiões, taxas e faixas de CEP. Somente o proprietário pode
            alterar esta configuração comercial.
          </p>
        </div>
      ) : null}

      {zones.length === 0 ? (
        <EmptyState
          icon={<Truck aria-hidden="true" />}
          title="Defina sua área de entrega"
          description="Cadastre uma região com pelo menos uma faixa de CEP para liberar o cálculo seguro no checkout."
          action={
            canEdit ? (
              <Button type="button" onClick={() => openEditor('new')}>
                <Plus aria-hidden="true" /> Cadastrar primeira região
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="delivery-regions-heading" className="space-y-3">
          <div>
            <h2 id="delivery-regions-heading" className="text-text-primary text-lg font-semibold">
              Regiões cadastradas
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              {pluralize(zones.length, 'região configurada', 'regiões configuradas')}.
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {zones.map((zone) => (
              <article
                key={zone.id}
                aria-labelledby={`delivery-zone-${zone.id}`}
                className="border-border bg-surface min-w-0 rounded-xl border p-4"
              >
                <header className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3
                        id={`delivery-zone-${zone.id}`}
                        className="text-text-primary min-w-0 font-semibold text-pretty"
                      >
                        {zone.name}
                      </h3>
                      <Badge variant={zone.isActive ? 'success' : 'secondary'}>
                        {zone.isActive ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  </div>
                  {zone.isActive ? (
                    <CheckCircle2
                      className="text-success mt-0.5 h-5 w-5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                </header>

                <dl className="border-border mt-4 grid grid-cols-2 border-y py-3 sm:grid-cols-3">
                  <div className="min-w-0 pr-3">
                    <dt className="text-text-secondary text-xs">Taxa</dt>
                    <dd className="text-text-primary mt-0.5 font-mono text-sm font-semibold">
                      {formatCurrency(zone.fee)}
                    </dd>
                  </div>
                  <div className="border-border min-w-0 border-l px-3">
                    <dt className="text-text-secondary text-xs">Prazo</dt>
                    <dd className="text-text-primary mt-0.5 text-sm font-semibold">
                      {zone.estimatedTime || 'Prazo geral'}
                    </dd>
                  </div>
                  <div className="border-border col-span-2 mt-3 min-w-0 border-t pt-3 sm:col-span-1 sm:mt-0 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
                    <dt className="text-text-secondary text-xs">Pedido mínimo</dt>
                    <dd className="text-text-primary mt-0.5 font-mono text-sm font-semibold">
                      {zone.minOrderValue == null || zone.minOrderValue === 0
                        ? 'Mínimo geral'
                        : formatCurrency(zone.minOrderValue)}
                    </dd>
                  </div>
                </dl>

                <details className="group mt-3">
                  <summary className="text-text-primary focus-visible:ring-brand-500 flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="text-text-secondary h-4 w-4 shrink-0" aria-hidden="true" />
                      {pluralize(zone.postalRanges.length, 'faixa de CEP', 'faixas de CEP')}
                    </span>
                    <ChevronDown
                      className="text-text-secondary h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <ul className="mt-1 grid gap-2 sm:grid-cols-2">
                    {zone.postalRanges.map((range) => (
                      <li
                        key={range.id}
                        className="bg-surface-secondary text-text-secondary min-w-0 rounded-lg px-3 py-2 font-mono text-sm"
                      >
                        <span className="sr-only">Do CEP </span>
                        {formatPostalCode(range.postalCodeStart)}
                        <span aria-hidden="true"> — </span>
                        <span className="sr-only"> até </span>
                        {formatPostalCode(range.postalCodeEnd)}
                      </li>
                    ))}
                  </ul>
                </details>

                {canEdit ? (
                  <footer className="border-border mt-3 flex items-center justify-end gap-1 border-t pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(zone)}
                      aria-label={`Editar região ${zone.name}`}
                    >
                      <Pencil aria-hidden="true" /> Editar
                    </Button>
                    <ConfirmDialog
                      title={`Excluir “${zone.name}”?`}
                      description="A região deixará de aparecer no checkout. Pedidos existentes manterão os valores e o endereço já confirmados."
                      confirmLabel="Excluir região"
                      pendingLabel="Excluindo…"
                      destructive
                      onConfirm={() => handleDelete(zone)}
                      trigger={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-error hover:bg-error-light hover:text-error"
                          aria-label={`Excluir região ${zone.name}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      }
                    />
                  </footer>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}

      {canEdit ? (
        <Dialog.Root open={editorOpen} onOpenChange={(open) => !open && setEditor(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className="bg-tinta/45 fixed inset-0 z-40" />
            <Dialog.Content
              className={cn(
                'bg-surface fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden shadow-lg focus:outline-none',
                'inset-x-0 bottom-0 rounded-t-xl',
                'sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
              )}
              aria-describedby="delivery-zone-editor-description"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusRef.current?.focus();
              }}
            >
              <div className="border-border bg-surface sticky top-0 z-10 flex items-start gap-3 border-b p-4 sm:p-5">
                <span className="bg-brand-50 text-brand-700 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                  {editorZone ? (
                    <Pencil className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Truck className="h-5 w-5" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-text-primary text-lg font-semibold text-balance">
                    {editorZone ? `Editar ${editorZone.name}` : 'Nova região de entrega'}
                  </Dialog.Title>
                  <Dialog.Description
                    id="delivery-zone-editor-description"
                    className="text-text-secondary mt-1 text-sm text-pretty"
                  >
                    Defina como o checkout valida e calcula a entrega nesta região.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Fechar editor">
                    <X aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              </div>

              <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
                <DeliveryZoneForm
                  key={editorZone?.id ?? `new-${summary.nextSortOrder}`}
                  zone={editorZone}
                  defaultSortOrder={summary.nextSortOrder}
                  onCancel={() => setEditor(null)}
                  onSaved={() => setEditor(null)}
                />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
