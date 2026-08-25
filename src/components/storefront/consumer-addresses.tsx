'use client';

import { Check, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deleteConsumerAddressAction,
  saveConsumerAddressAction,
  setDefaultConsumerAddressAction,
} from '@/features/consumer-account/actions';

type Address = {
  id: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string | null;
  reference: string | null;
  isDefault: boolean;
};
const EMPTY = {
  label: 'HOME' as const,
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
  reference: '',
  isDefault: false,
};
type AddressForm = Omit<typeof EMPTY, 'label'> & { label: Address['label'] };

export function ConsumerAddresses({
  storeSlug,
  addresses,
}: {
  storeSlug: string;
  addresses: Address[];
}) {
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function begin(address?: Address) {
    setEditing(address ?? 'new');
    setFeedback(null);
    setForm(
      address
        ? {
            label: address.label,
            street: address.street,
            number: address.number,
            complement: address.complement ?? '',
            neighborhood: address.neighborhood,
            city: address.city,
            state: address.state,
            zipCode: address.zipCode ?? '',
            reference: address.reference ?? '',
            isDefault: address.isDefault,
          }
        : EMPTY,
    );
  }
  function save() {
    startTransition(async () => {
      const result = await saveConsumerAddressAction(
        storeSlug,
        editing === 'new' ? null : (editing?.id ?? null),
        form,
      );
      if (!result.success) setFeedback(result.error.message);
      else {
        setEditing(null);
        setFeedback(null);
      }
    });
  }
  return (
    <div>
      <ul className="grid gap-3">
        {addresses.map((address) => (
          <li key={address.id} className="border-border bg-surface rounded-xl border p-4">
            <button
              type="button"
              onClick={() => begin(address)}
              className="focus-visible:ring-brand-500 flex min-h-11 w-full items-start gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:outline-none"
            >
              <MapPin className="text-brand-600 mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {address.street}, {address.number}
                </span>
                <span className="text-text-secondary mt-0.5 block text-sm">
                  {address.neighborhood} · {address.city}/{address.state}
                </span>
                {address.isDefault ? (
                  <span className="text-success mt-1 block text-xs font-semibold">
                    Endereço principal
                  </span>
                ) : null}
              </span>
              <Pencil className="text-text-muted h-4 w-4" aria-hidden="true" />
            </button>
            {!address.isDefault ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setDefaultConsumerAddressAction(storeSlug, address.id);
                    if (!result.success) setFeedback(result.error.message);
                  })
                }
              >
                <Check aria-hidden="true" />
                Definir como principal
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => begin()}>
        <Plus aria-hidden="true" />
        Adicionar endereço
      </Button>
      {editing ? (
        <section
          className="border-border bg-surface mt-5 rounded-xl border p-4"
          aria-labelledby="address-form-title"
        >
          <div className="flex items-center justify-between">
            <h2 id="address-form-title" className="font-bold">
              {editing === 'new' ? 'Novo endereço' : 'Editar endereço'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(null)}
              aria-label="Fechar formulário"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              Rua
              <Input
                className="mt-1"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Número
              <Input
                className="mt-1"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Complemento
              <Input
                className="mt-1"
                value={form.complement}
                onChange={(e) => setForm({ ...form, complement: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Bairro
              <Input
                className="mt-1"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Cidade
              <Input
                className="mt-1"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold">
              Estado
              <Input
                className="mt-1 uppercase"
                maxLength={2}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              CEP
              <Input
                className="mt-1"
                inputMode="numeric"
                value={form.zipCode}
                onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Referência
              <Input
                className="mt-1"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Usar como endereço principal
            </label>
          </div>
          {feedback ? (
            <p role="alert" className="bg-error-light text-error mt-3 rounded-lg p-3 text-sm">
              {feedback}
            </p>
          ) : null}
          <Button type="button" className="mt-4 w-full" disabled={pending} onClick={save}>
            {pending ? 'Salvando…' : 'Salvar endereço'}
          </Button>
          {editing !== 'new' ? (
            confirmDelete === editing.id ? (
              <div className="bg-error-light mt-4 rounded-lg p-3">
                <p className="text-error text-sm font-semibold">
                  Excluir este endereço? Esta ação não altera pedidos antigos.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteConsumerAddressAction(storeSlug, editing.id);
                        if (result.success) {
                          setEditing(null);
                          setConfirmDelete(null);
                        } else setFeedback(result.error.message);
                      })
                    }
                  >
                    Confirmar exclusão
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="text-error mt-4 w-full"
                onClick={() => setConfirmDelete(editing.id)}
              >
                <Trash2 aria-hidden="true" />
                Excluir endereço
              </Button>
            )
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
