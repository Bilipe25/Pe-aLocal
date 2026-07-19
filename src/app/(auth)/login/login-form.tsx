'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { loginSchema, type LoginInput } from '@/schemas/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DemoCredentials {
  email: string;
  password: string;
}

export function LoginForm({ demoCredentials }: { demoCredentials?: DemoCredentials }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    clearErrors,
    setFocus,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  function fillDemoCredentials() {
    if (!demoCredentials) return;

    setValue('email', demoCredentials.email, { shouldDirty: true });
    setValue('password', demoCredentials.password, { shouldDirty: true });
    clearErrors();
    setFormError(null);
    setFocus('email');
  }

  async function onSubmit(data: LoginInput) {
    setIsLoading(true);
    setFormError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, redirect: redirectTo }),
      });

      const result: unknown = await response.json();
      const message =
        typeof result === 'object' && result !== null && 'message' in result
          ? String(result.message)
          : undefined;
      const userName =
        typeof result === 'object' &&
        result !== null &&
        'user' in result &&
        typeof result.user === 'object' &&
        result.user !== null &&
        'name' in result.user
          ? String(result.user.name)
          : 'usuário';
      const destination =
        typeof result === 'object' &&
        result !== null &&
        'destination' in result &&
        typeof result.destination === 'string'
          ? result.destination
          : '/access-pending';

      if (!response.ok) {
        setFormError(message ?? 'Não foi possível entrar. Confira seu e-mail e sua senha.');
        return;
      }

      toast.success(`Bem-vindo, ${userName}!`);
      router.push(destination);
      router.refresh();
    } catch {
      setFormError('Não foi possível conectar. Verifique sua conexão e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      aria-describedby={formError ? 'login-form-error' : undefined}
    >
      {formError && (
        <div
          id="login-form-error"
          role="alert"
          className="border-error/30 bg-error-light text-error rounded-lg border p-3 text-sm"
        >
          {formError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email', { onChange: () => setFormError(null) })}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-error text-sm">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isLoading}
            className="pr-12"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password', { onChange: () => setFormError(null) })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isLoading}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="text-text-muted hover:text-text-primary absolute top-0 right-0"
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-error text-sm">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Entrando...
          </>
        ) : (
          'Entrar'
        )}
      </Button>
      <div className="grid gap-1 text-sm">
        <Link
          className="text-brand-700 flex min-h-11 items-center justify-center text-center underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Esqueci minha senha
        </Link>
        <Link
          className="text-text-secondary hover:text-text-primary flex min-h-11 items-center justify-center text-center underline-offset-4 hover:underline"
          href="/access-help"
        >
          Preciso de acesso à loja
        </Link>
      </div>

      {demoCredentials && (
        <aside
          className="border-border border-t pt-4 text-sm"
          aria-label="Conta de demonstração local"
        >
          <p className="text-text-primary font-medium">Conta de demonstração local</p>
          <p className="text-text-secondary mt-1 text-pretty">
            Preencha o formulário com dados fictícios para testar o painel.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={fillDemoCredentials}
            disabled={isLoading}
          >
            Preencher dados de demonstração
          </Button>
        </aside>
      )}
    </form>
  );
}
