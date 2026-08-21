'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createCanonicalOfferAction } from '@/features/offers/actions';
import type { OfferEditorProduct } from '@/features/offers/components/combo-form';
import { OfferScheduleFields } from '@/features/offers/components/offer-schedule-fields';
import { formatCurrency } from '@/lib/utils';
import type { z } from 'zod';
import { canonicalOfferKindSchema } from '@/schemas/offers';

type CanonicalKind = z.infer<typeof canonicalOfferKindSchema>;

const KIND_OPTIONS: Array<{ value: CanonicalKind; label: string }> = [
  { value: 'COMBO_FLEXIBLE', label: 'Montar um combo com escolhas' },
  { value: 'PRODUCT_FIXED_PRICE', label: 'Reduzir o preço de um produto' },
  { value: 'QUANTITY_FIXED_PRICE', label: 'Leve uma quantidade por preço fixo' },
  { value: 'BOGO', label: 'Compre e ganhe' },
  { value: 'CART_FIXED_DISCOUNT', label: 'Dar desconto no carrinho' },
  { value: 'FREE_DELIVERY', label: 'Oferecer entrega grátis' },
];

interface FlexibleChoiceDraft {
  key: string;
  productId: string;
  priceDelta: number;
}

interface FlexibleGroupDraft {
  key: string;
  name: string;
  quantity: number;
  choices: FlexibleChoiceDraft[];
}

function newChoice(): FlexibleChoiceDraft {
  return { key: crypto.randomUUID(), productId: '', priceDelta: 0 };
}

function newGroup(position: number): FlexibleGroupDraft {
  return {
    key: crypto.randomUUID(),
    name:
      position === 0
        ? 'Escolha o principal'
        : position === 1
          ? 'Escolha a bebida'
          : `Escolha ${position + 1}`,
    quantity: 1,
    choices: [newChoice()],
  };
}

export function CanonicalOfferForm({
  products,
  initialKind = 'PRODUCT_FIXED_PRICE',
}: {
  products: OfferEditorProduct[];
  initialKind?: CanonicalKind;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<CanonicalKind>(initialKind);
  const [error, setError] = useState<string | null>(null);
  const [fixedPrice, setFixedPrice] = useState(0);
  const [groups, setGroups] = useState<FlexibleGroupDraft[]>(() => [newGroup(0), newGroup(1)]);
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productOffer = ['PRODUCT_FIXED_PRICE', 'QUANTITY_FIXED_PRICE', 'BOGO'].includes(kind);
  const flexibleCombo = kind === 'COMBO_FLEXIBLE';
  const minimumNetRegularPrice =
    flexibleCombo &&
    groups.every((group) => group.choices.some((choice) => byId.has(choice.productId)))
      ? groups.reduce((total, group) => {
          const minimum = Math.min(
            ...group.choices
              .filter((choice) => byId.has(choice.productId))
              .map((choice) => byId.get(choice.productId)!.basePrice - choice.priceDelta),
          );
          return total + minimum * group.quantity;
        }, 0)
      : 0;

  function updateGroup(key: string, patch: Partial<Omit<FlexibleGroupDraft, 'choices'>>) {
    setGroups((current) =>
      current.map((group) => (group.key === key ? { ...group, ...patch } : group)),
    );
  }

  function updateChoice(groupKey: string, choiceKey: string, patch: Partial<FlexibleChoiceDraft>) {
    setGroups((current) =>
      current.map((group) =>
        group.key === groupKey
          ? {
              ...group,
              choices: group.choices.map((choice) =>
                choice.key === choiceKey ? { ...choice, ...patch } : choice,
              ),
            }
          : group,
      ),
    );
  }

  async function submit(formData: FormData) {
    setError(null);
    if (flexibleCombo) {
      formData.set(
        'groups',
        JSON.stringify(
          groups.map((group) => ({
            name: group.name,
            quantity: group.quantity,
            choices: group.choices.map((choice) => ({
              productId: choice.productId,
              priceDelta: choice.priceDelta / 100,
            })),
          })),
        ),
      );
    }
    const result = await createCanonicalOfferAction(formData);
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success('Oferta publicada.');
    router.push('/dashboard/offers');
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-7">
      <FormMessage message={error} />
      <section className="border-border bg-surface space-y-6 rounded-xl border p-4 sm:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="offer-kind">Objetivo da oferta</Label>
            <select
              id="offer-kind"
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as CanonicalKind)}
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-name">Nome para a equipe e para o cliente</Label>
            <Input
              id="offer-name"
              name="name"
              required
              maxLength={120}
              placeholder="Ex.: Terça em dobro"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="offer-description">Descrição opcional</Label>
          <Textarea id="offer-description" name="description" maxLength={500} rows={3} />
        </div>

        {productOffer && (
          <div className="space-y-2">
            <Label htmlFor="offer-product">Produto</Label>
            <select
              id="offer-product"
              name="productId"
              required
              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="">Selecione um produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {flexibleCombo && (
          <section
            className="border-border space-y-4 rounded-xl border p-4"
            aria-labelledby="flexible-groups-title"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="flexible-groups-title" className="text-text-primary font-semibold">
                  Escolhas do combo
                </h2>
                <p className="text-text-secondary mt-1 text-sm">
                  Cada grupo pede uma escolha. O adicional é somado ao preço-base do combo.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setGroups((current) => [...current, newGroup(current.length)])}
              >
                <Plus aria-hidden="true" /> Adicionar grupo
              </Button>
            </div>
            <div className="space-y-4">
              {groups.map((group, groupIndex) => (
                <fieldset key={group.key} className="border-border space-y-4 rounded-xl border p-4">
                  <legend className="text-text-primary px-1 text-sm font-semibold">
                    Grupo {groupIndex + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                    <div className="space-y-2">
                      <Label htmlFor={`group-name-${group.key}`}>O que o cliente escolhe?</Label>
                      <Input
                        id={`group-name-${group.key}`}
                        value={group.name}
                        maxLength={80}
                        onChange={(event) => updateGroup(group.key, { name: event.target.value })}
                        placeholder="Ex.: Escolha a bebida"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`group-quantity-${group.key}`}>Quantidade</Label>
                      <Input
                        id={`group-quantity-${group.key}`}
                        type="number"
                        min={1}
                        max={99}
                        value={group.quantity}
                        onChange={(event) =>
                          updateGroup(group.key, {
                            quantity: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={groups.length <= 2}
                      onClick={() =>
                        setGroups((current) =>
                          current.filter((candidate) => candidate.key !== group.key),
                        )
                      }
                      aria-label={`Remover grupo ${groupIndex + 1}`}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {group.choices.map((choice, choiceIndex) => {
                      const selectedElsewhere = new Set(
                        group.choices
                          .filter((candidate) => candidate.key !== choice.key)
                          .map((candidate) => candidate.productId),
                      );
                      return (
                        <div
                          key={choice.key}
                          className="bg-surface-secondary grid gap-3 rounded-lg p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
                        >
                          <div className="space-y-2">
                            <Label htmlFor={`choice-product-${choice.key}`}>
                              Opção {choiceIndex + 1}
                            </Label>
                            <select
                              id={`choice-product-${choice.key}`}
                              required
                              value={choice.productId}
                              onChange={(event) =>
                                updateChoice(group.key, choice.key, {
                                  productId: event.target.value,
                                })
                              }
                              className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                            >
                              <option value="">Selecione um produto</option>
                              {products.map((product) => (
                                <option
                                  key={product.id}
                                  value={product.id}
                                  disabled={selectedElsewhere.has(product.id)}
                                >
                                  {product.name} · {formatCurrency(product.basePrice)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`choice-delta-${choice.key}`}>Adicional</Label>
                            <PriceInput
                              id={`choice-delta-${choice.key}`}
                              name={`choiceDelta-${choice.key}`}
                              defaultPrice={choice.priceDelta / 100}
                              onChange={(event) =>
                                updateChoice(group.key, choice.key, {
                                  priceDelta: Math.max(
                                    0,
                                    Math.round((Number(event.target.value) || 0) * 100),
                                  ),
                                })
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={group.choices.length <= 1}
                            onClick={() =>
                              setGroups((current) =>
                                current.map((candidate) =>
                                  candidate.key === group.key
                                    ? {
                                        ...candidate,
                                        choices: candidate.choices.filter(
                                          (item) => item.key !== choice.key,
                                        ),
                                      }
                                    : candidate,
                                ),
                              )
                            }
                            aria-label={`Remover opção ${choiceIndex + 1} do grupo ${groupIndex + 1}`}
                          >
                            <Minus aria-hidden="true" />
                          </Button>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setGroups((current) =>
                          current.map((candidate) =>
                            candidate.key === group.key
                              ? { ...candidate, choices: [...candidate.choices, newChoice()] }
                              : candidate,
                          ),
                        )
                      }
                    >
                      <Plus aria-hidden="true" /> Adicionar opção
                    </Button>
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(kind === 'COMBO_FLEXIBLE' ||
            kind === 'PRODUCT_FIXED_PRICE' ||
            kind === 'QUANTITY_FIXED_PRICE') && (
            <div className="space-y-2">
              <Label htmlFor="offer-fixed-price">
                {flexibleCombo ? 'Preço-base do combo' : 'Preço promocional'}
              </Label>
              <PriceInput
                id="offer-fixed-price"
                name="fixedPrice"
                required
                onChange={(event) =>
                  setFixedPrice(Math.max(0, Math.round((Number(event.target.value) || 0) * 100)))
                }
              />
              {flexibleCombo && minimumNetRegularPrice > 0 && (
                <p className="text-text-secondary text-xs">
                  Economia mínima entre as escolhas:{' '}
                  {formatCurrency(Math.max(0, minimumNetRegularPrice - fixedPrice))}
                </p>
              )}
            </div>
          )}
          {kind === 'QUANTITY_FIXED_PRICE' && (
            <div className="space-y-2">
              <Label htmlFor="offer-required-quantity">Quantidade do grupo</Label>
              <Input
                id="offer-required-quantity"
                name="requiredQuantity"
                type="number"
                min={2}
                max={99}
                defaultValue={3}
                required
              />
            </div>
          )}
          {kind === 'BOGO' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="offer-buy-quantity">Quantidade comprada</Label>
                <Input
                  id="offer-buy-quantity"
                  name="buyQuantity"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={1}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-get-quantity">Quantidade grátis</Label>
                <Input
                  id="offer-get-quantity"
                  name="getQuantity"
                  type="number"
                  min={1}
                  max={99}
                  defaultValue={1}
                  required
                />
              </div>
            </>
          )}
          {kind === 'CART_FIXED_DISCOUNT' && (
            <div className="space-y-2">
              <Label htmlFor="offer-discount">Valor do desconto</Label>
              <PriceInput id="offer-discount" name="discountValue" required />
            </div>
          )}
          {(kind === 'CART_FIXED_DISCOUNT' || kind === 'FREE_DELIVERY') && (
            <div className="space-y-2">
              <Label htmlFor="offer-min-subtotal">Pedido mínimo</Label>
              <PriceInput id="offer-min-subtotal" name="minSubtotal" defaultPrice={0} />
              <p className="text-text-secondary text-xs">Deixe R$ 0 para aplicar sem mínimo.</p>
            </div>
          )}
          {!['CART_FIXED_DISCOUNT', 'FREE_DELIVERY'].includes(kind) && (
            <div className="space-y-2">
              <Label htmlFor="offer-max-applications">Máximo por pedido</Label>
              <Input
                id="offer-max-applications"
                name="maxApplicationsPerOrder"
                type="number"
                min={1}
                max={99}
                defaultValue={99}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="offer-max-total-uses">Limite total de usos</Label>
            <Input
              id="offer-max-total-uses"
              name="maxTotalUses"
              type="number"
              min={1}
              max={2147483647}
              placeholder="Sem limite"
            />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-text-primary text-sm font-medium">Modalidades</legend>
          {kind === 'FREE_DELIVERY' ? (
            <>
              <input type="hidden" name="modalities" value="DELIVERY" />
              <p className="text-text-secondary text-sm">Frete grátis vale somente para entrega.</p>
            </>
          ) : (
            <>
              <p className="text-text-secondary text-sm">
                Nenhuma seleção significa todas as modalidades.
              </p>
              <div className="flex flex-wrap gap-4">
                {[
                  ['DELIVERY', 'Entrega'],
                  ['PICKUP', 'Retirada'],
                  ['DINE_IN', 'Mesa'],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="text-text-primary flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input type="checkbox" name="modalities" value={value} className="h-4 w-4" />
                    {label}
                  </label>
                ))}
              </div>
            </>
          )}
        </fieldset>
        <OfferScheduleFields prefix="canonical" />
      </section>

      <div className="border-border bg-surface flex min-h-16 items-center justify-between gap-4 rounded-xl border px-4">
        <div>
          <Label htmlFor="offer-active">Publicar ativa</Label>
          <p className="text-text-secondary mt-1 text-sm">
            A oferta respeitará agenda, modalidade e limites.
          </p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch id="offer-active" name="isActive" value="true" defaultChecked />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/offers/new')}>
          Cancelar
        </Button>
        <FormSubmitButton pendingLabel="Publicando oferta…">Publicar oferta</FormSubmitButton>
      </div>
    </form>
  );
}
