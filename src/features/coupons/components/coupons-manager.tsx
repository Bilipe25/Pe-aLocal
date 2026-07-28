'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Eye, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteCouponAction } from '@/features/coupons/actions';
import { CouponForm, type CouponData } from '@/features/coupons/components/coupon-form';
import { formatCurrency } from '@/lib/utils';

function couponStatus(coupon: CouponData, now: number) {
  if (!coupon.isActive) return { label: 'Inativo', variant: 'secondary' as const };
  if (coupon.maxUsages !== null && coupon.usageCount >= coupon.maxUsages) {
    return { label: 'Esgotado', variant: 'warning' as const };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) {
    return { label: 'Expirado', variant: 'secondary' as const };
  }
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) {
    return { label: 'Agendado', variant: 'outline' as const };
  }
  return { label: 'Ativo', variant: 'success' as const };
}

function formatCouponValue(coupon: CouponData) {
  return coupon.type === 'PERCENTAGE' ? `${coupon.value}%` : formatCurrency(coupon.value);
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function CouponsManager({
  coupons,
  canEdit,
  page,
  totalPages,
  total,
  referenceTime,
}: {
  coupons: CouponData[];
  canEdit: boolean;
  page: number;
  totalPages: number;
  total: number;
  referenceTime: number;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(canEdit && total === 0);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function remove(coupon: CouponData) {
    const result = await deleteCouponAction(coupon.id);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(`Cupom “${coupon.code}” excluído.`);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary text-sm">
          {total} {total === 1 ? 'cupom cadastrado' : 'cupons cadastrados'} nesta loja.
        </p>
        {canEdit && !creating && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Novo cupom
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="border-info/25 bg-info-light text-text-primary flex items-start gap-3 rounded-lg border p-3 text-sm">
          <Eye className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Seu perfil pode consultar regras e resultados. Somente o proprietário pode criar, editar
            ou excluir cupons.
          </p>
        </div>
      )}

      {creating && (
        <section
          className="border-border bg-surface rounded-xl border p-4 sm:p-5"
          aria-labelledby="new-coupon-heading"
        >
          <div className="mb-5">
            <h2 id="new-coupon-heading" className="text-text-primary text-lg font-semibold">
              Criar cupom
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              As regras serão revalidadas pelo servidor no momento da compra.
            </p>
          </div>
          <CouponForm
            onCancel={total > 0 ? () => setCreating(false) : undefined}
            onSaved={() => setCreating(false)}
          />
        </section>
      )}

      {coupons.length === 0 && !creating ? (
        <EmptyState
          icon={<TicketPercent aria-hidden="true" />}
          title="Nenhum cupom cadastrado"
          description={
            canEdit
              ? 'Crie uma condição promocional exclusiva para esta loja.'
              : 'Ainda não há condições promocionais para consultar.'
          }
        />
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon) => {
            const status = couponStatus(coupon, referenceTime);
            const start = formatDate(coupon.startsAt);
            const end = formatDate(coupon.expiresAt);
            return (
              <section key={coupon.id} className="border-border bg-surface rounded-xl border">
                <div className="flex flex-col gap-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-text-primary font-mono text-lg font-bold">
                          {coupon.code}
                        </h2>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="text-text-primary mt-2 text-2xl font-bold">
                        {formatCouponValue(coupon)}
                        <span className="text-text-secondary ml-2 text-sm font-normal">
                          de desconto
                        </span>
                      </p>
                    </div>

                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setEditingId((current) => (current === coupon.id ? null : coupon.id))
                          }
                        >
                          <Pencil aria-hidden="true" /> Editar
                        </Button>
                        {coupon.usageCount === 0 && (
                          <ConfirmDialog
                            title={`Excluir “${coupon.code}”?`}
                            description="A exclusão é permanente e será registrada na auditoria. Cupons com uso não podem ser excluídos."
                            confirmLabel="Excluir cupom"
                            destructive
                            onConfirm={() => remove(coupon)}
                            trigger={
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-error hover:bg-error-light hover:text-error"
                              >
                                <Trash2 aria-hidden="true" /> Excluir
                              </Button>
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <dl className="border-border grid gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-text-secondary">Pedido mínimo</dt>
                      <dd className="text-text-primary mt-1 font-medium">
                        {coupon.minOrderValue ? formatCurrency(coupon.minOrderValue) : 'Sem mínimo'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-secondary">Usos</dt>
                      <dd className="text-text-primary mt-1 font-medium">
                        {coupon.usageCount}
                        {coupon.maxUsages === null ? ' · sem limite' : ` de ${coupon.maxUsages}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-secondary">Desconto máximo</dt>
                      <dd className="text-text-primary mt-1 font-medium">
                        {coupon.type === 'PERCENTAGE' && coupon.maxDiscount
                          ? formatCurrency(coupon.maxDiscount)
                          : 'Sem limite adicional'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-secondary">Validade</dt>
                      <dd className="text-text-primary mt-1 flex items-start gap-2 font-medium">
                        <CalendarClock
                          className="text-text-muted mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          {!start && !end
                            ? 'Sem prazo'
                            : `${start ? `De ${start}` : 'Imediata'}${end ? ` até ${end}` : ''}`}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {canEdit && coupon.usageCount > 0 && (
                    <p className="text-text-secondary text-sm">
                      Para preservar pedidos e auditoria, cupons utilizados podem ser desativados,
                      mas não excluídos.
                    </p>
                  )}
                </div>

                {canEdit && editingId === coupon.id && (
                  <div className="border-border border-t p-4 sm:p-5">
                    <CouponForm
                      coupon={coupon}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => setEditingId(null)}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Paginação de cupons"
          className="flex items-center justify-between gap-3 pt-2"
        >
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/coupons?page=${page - 1}`}>Anterior</Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              Anterior
            </Button>
          )}
          <p className="text-text-secondary text-sm">
            Página {page} de {totalPages}
          </p>
          {page < totalPages ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/coupons?page=${page + 1}`}>Próxima</Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" disabled>
              Próxima
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
