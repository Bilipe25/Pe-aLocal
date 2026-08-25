'use client';

import { MonitorSmartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface SessionItem {
  id: string;
  deviceLabel: string | null;
  lastUsedAt: string;
  current: boolean;
}

function isSessionPayload(value: unknown): value is { sessions: SessionItem[] } {
  return Boolean(
    value && typeof value === 'object' && 'sessions' in value && Array.isArray(value.sessions),
  );
}

export function ConsumerSessions({ storeSlug }: { storeSlug: string }) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mutating, setMutating] = useState(false);
  const endpoint = `/api/storefront/${encodeURIComponent(storeSlug)}/consumer/sessions`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSessionPayload(payload)) throw new Error();
      setSessions(payload.sessions);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(method: 'POST' | 'DELETE', body: object) {
    setMutating(true);
    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      toast.success('Sessão encerrada.');
      await load();
    } catch {
      toast.error('Não foi possível encerrar a sessão.');
    } finally {
      setMutating(false);
    }
  }

  if (loading) return <p className="text-text-secondary text-sm">Carregando aparelhos…</p>;
  if (error) {
    return (
      <div role="alert">
        <p className="text-text-secondary text-sm">Não foi possível carregar os aparelhos.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void load()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="consumer-sessions-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="consumer-sessions-title" className="font-semibold">
            Aparelhos conectados
          </h2>
          <p className="text-text-secondary mt-1 text-sm">No máximo cinco sessões ativas.</p>
        </div>
        {sessions.some((session) => !session.current) && (
          <Button
            type="button"
            variant="outline"
            disabled={mutating}
            onClick={() => void mutate('POST', { revokeOthers: true })}
          >
            Sair dos outros
          </Button>
        )}
      </div>
      <ul className="mt-4 grid gap-3">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="border-border bg-surface flex min-h-16 items-center gap-3 rounded-xl border p-4"
          >
            <MonitorSmartphone className="text-brand-600 size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{session.deviceLabel ?? 'Navegador'}</p>
              <p className="text-text-secondary text-xs">
                {session.current
                  ? 'Este aparelho'
                  : `Usado em ${new Date(session.lastUsedAt).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
            {!session.current && (
              <Button
                type="button"
                variant="ghost"
                disabled={mutating}
                onClick={() => void mutate('DELETE', { sessionId: session.id })}
              >
                Encerrar
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
