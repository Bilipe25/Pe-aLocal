'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.get('email') }),
    });
    const result = (await response.json()) as { message: string };
    setMessage(result.message);
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button className="w-full" disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar instruções'}
      </Button>
      {message && <p className="text-text-secondary text-sm">{message}</p>}
      <Link className="block text-center text-sm underline" href="/login">
        Voltar ao login
      </Link>
    </form>
  );
}
