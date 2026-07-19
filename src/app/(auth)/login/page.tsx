import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  resolvePostLoginDestination,
  validateCurrentSession,
} from '@/server/services/auth.service';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Entrar',
  description: 'Acesso ao painel dos estabelecimentos no PedidoLocal.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  const requestedRedirect = (await searchParams).redirect;
  const session = await validateCurrentSession();
  if (session) {
    redirect(
      resolvePostLoginDestination(
        session,
        typeof requestedRedirect === 'string' ? requestedRedirect : null,
      ),
    );
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <Card>
        <CardHeader className="text-center">
          <p className="text-text-secondary text-sm font-medium">Acesso para estabelecimentos</p>
          <CardTitle className="font-display text-2xl">
            <h1 className="text-balance">Entrar no painel</h1>
          </CardTitle>
          <CardDescription>Use o e-mail cadastrado pela sua loja.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div role="status" aria-live="polite" className="space-y-4">
                <span className="sr-only">Carregando formulário de acesso...</span>
                <div
                  aria-hidden="true"
                  className="bg-surface-secondary h-48 animate-pulse rounded-lg"
                />
              </div>
            }
          >
            <LoginForm
              demoCredentials={
                process.env.NODE_ENV === 'development'
                  ? { email: 'dono@demo.com', password: 'SenhaDemo123!' }
                  : undefined
              }
            />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
