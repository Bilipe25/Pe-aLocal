'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ResetPasswordForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmation')) {
      setMessage('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: data.get('password') }),
    });
    const result = (await response.json()) as { message: string };
    setMessage(result.message);
    setLoading(false);
    if (response.ok) setTimeout(() => router.replace('/dashboard'), 800);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation">Confirmar senha</Label>
        <Input id="confirmation" name="confirmation" type="password" minLength={8} required />
      </div>
      <Button className="w-full" disabled={loading}>
        {loading ? 'Atualizando...' : 'Atualizar senha'}
      </Button>
      {message && <p className="text-text-secondary text-sm">{message}</p>}
    </form>
  );
}
