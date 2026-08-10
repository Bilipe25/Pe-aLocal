'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function UnsavedChangesGuard({ active }: { active: boolean }) {
  const [destination, setDestination] = useState<string | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!active) {
      if (window.history.state?.__pedidoLocalUnsavedGuard) window.history.back();
      return;
    }

    if (!window.history.state?.__pedidoLocalUnsavedGuard) {
      window.history.pushState(
        { ...window.history.state, __pedidoLocalUnsavedGuard: true },
        '',
        window.location.href,
      );
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (bypass.current) return;
      event.preventDefault();
    };
    const interceptLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search &&
        next.hash
      ) {
        return;
      }
      event.preventDefault();
      setDestination(next.href);
    };
    const interceptHistory = () => {
      if (bypass.current) return;
      const attemptedDestination = window.location.href;
      window.history.forward();
      setDestination(attemptedDestination);
    };

    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', interceptHistory);
    document.addEventListener('click', interceptLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', interceptHistory);
      document.removeEventListener('click', interceptLink, true);
    };
  }, [active]);

  function leave() {
    if (!destination) return;
    bypass.current = true;
    window.location.assign(destination);
  }

  return (
    <Dialog.Root open={Boolean(destination)} onOpenChange={(open) => !open && setDestination(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-tinta/50 fixed inset-0 z-40" />
        <Dialog.Content className="bg-surface fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl p-5 shadow-lg focus:outline-none">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-warning mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <Dialog.Title className="text-text-primary text-lg font-semibold">
                Sair sem salvar?
              </Dialog.Title>
              <Dialog.Description className="text-text-secondary mt-2 text-sm">
                As alterações feitas nesta tela ainda não foram salvas no rascunho.
              </Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="outline">Continuar editando</Button>
            </Dialog.Close>
            <Button variant="destructive" onClick={leave}>
              Sair sem salvar
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
