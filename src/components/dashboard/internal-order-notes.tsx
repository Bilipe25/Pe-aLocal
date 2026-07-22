'use client';

import { useState } from 'react';
import { ChevronDown, LockKeyhole, MessageSquarePlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { addInternalOrderNoteAction } from '@/features/orders/admin-actions';
import { orderQueryKeys, useOrderInternalNotes } from '@/hooks/use-orders';
import { cn } from '@/lib/utils';
import type { OrderDetailsDTO } from '@/types/order-query';

function formatNoteDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function InternalOrderNotes({
  order,
  storeId,
  authorizationScope,
  timeZone,
}: {
  order: OrderDetailsDTO;
  storeId: string;
  authorizationScope: string;
  timeZone: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const notesQuery = useOrderInternalNotes(storeId, authorizationScope, order.id, expanded);
  const notes = notesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function submitNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await addInternalOrderNoteAction({
        orderId: order.id,
        expectedVersion: order.version,
        body,
      });
      if (!result.success) {
        toast.error(result.error.message);
        if (result.error.code === 'CONFLICT') {
          await queryClient.invalidateQueries({
            queryKey: orderQueryKeys.details(storeId, authorizationScope, order.id),
          });
        }
        return;
      }
      setBody('');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orderQueryKeys.internalNotes(storeId, authorizationScope, order.id),
        }),
        queryClient.invalidateQueries({
          queryKey: orderQueryKeys.details(storeId, authorizationScope, order.id),
        }),
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) }),
      ]);
      toast.success('Observação interna adicionada.');
      if (result.data.notificationPending) {
        toast.warning('A observação foi salva; a atualização em tempo real está pendente.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!order.allowedActions.viewHistory) return null;

  return (
    <section aria-labelledby={`internal-notes-heading-${order.id}`}>
      <button
        type="button"
        className="focus-visible:ring-brand-500 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-expanded={expanded}
        aria-controls={`internal-notes-content-${order.id}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>
          <span
            id={`internal-notes-heading-${order.id}`}
            className="text-text-primary flex items-center gap-2 text-sm font-semibold"
          >
            <LockKeyhole aria-hidden="true" /> Observações internas
          </span>
          <span className="text-text-secondary mt-0.5 block text-xs">
            Visíveis somente para a equipe autorizada.
          </span>
        </span>
        <ChevronDown
          className={cn('shrink-0 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id={`internal-notes-content-${order.id}`} className="mt-3 space-y-4">
          {order.allowedActions.addInternalNote && (
            <form onSubmit={submitNote} className="bg-surface-secondary space-y-2 rounded-lg p-3">
              <label
                htmlFor={`internal-note-${order.id}`}
                className="text-text-primary text-sm font-medium"
              >
                Nova observação
              </label>
              <textarea
                id={`internal-note-${order.id}`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Ex.: cliente pediu para confirmar a retirada por telefone."
                className="border-border bg-surface text-text-primary placeholder:text-text-secondary focus-visible:ring-brand-500 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                disabled={saving}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-secondary text-xs">{body.length}/1000</span>
                <Button type="submit" size="sm" disabled={saving || !body.trim()}>
                  <MessageSquarePlus aria-hidden="true" />
                  {saving ? 'Salvando…' : 'Adicionar'}
                </Button>
              </div>
            </form>
          )}

          {notesQuery.isLoading ? (
            <div className="space-y-2" role="status" aria-label="Carregando observações internas">
              <div className="bg-surface-tertiary h-16 animate-pulse rounded-lg" />
              <div className="bg-surface-tertiary h-16 animate-pulse rounded-lg" />
            </div>
          ) : notesQuery.error ? (
            <div className="bg-error-light text-error rounded-lg px-3 py-2 text-sm" role="status">
              Não foi possível carregar as observações internas.
              <Button
                variant="ghost"
                size="sm"
                className="ml-1"
                onClick={() => notesQuery.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : notes.length === 0 ? (
            <p className="bg-surface-secondary text-text-secondary rounded-lg px-3 py-4 text-sm">
              Nenhuma observação interna registrada.
            </p>
          ) : (
            <ol className="space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="bg-surface-secondary rounded-lg p-3">
                  <p className="text-text-primary text-sm break-words whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="text-text-secondary mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>{note.authorName}</span>
                    <time dateTime={note.createdAt}>
                      {formatNoteDate(note.createdAt, timeZone)}
                    </time>
                  </p>
                </li>
              ))}
            </ol>
          )}

          {notesQuery.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => notesQuery.fetchNextPage()}
              disabled={notesQuery.isFetchingNextPage}
            >
              {notesQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar observações anteriores'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
