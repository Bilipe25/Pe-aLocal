'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';

export function ConsumerLogoutButton({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch(`/api/storefront/${encodeURIComponent(storeSlug)}/consumer-auth/logout`, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          router.replace(`/${storeSlug}/orders`);
          router.refresh();
        })
      }
    >
      <LogOut aria-hidden="true" />
      {pending ? 'Saindo…' : 'Sair'}
    </Button>
  );
}
