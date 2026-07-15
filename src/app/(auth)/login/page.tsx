import { Suspense } from 'react';
import { Store } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Entrar',
  description: 'Acesse o painel do seu estabelecimento.',
};

export default function LoginPage() {
  return (
    <main className="from-brand-50 via-surface to-brand-100 flex min-h-screen items-center justify-center bg-gradient-to-br p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-brand-500 hover:text-brand-600 flex items-center justify-center gap-2 transition-colors"
        >
          <Store className="h-8 w-8" />
          <span className="text-2xl font-bold">PedidoLocal</span>
        </Link>

        {/* Card de Login */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle>
              <h1>Entrar no painel</h1>
            </CardTitle>
            <CardDescription>Acesse o painel do seu estabelecimento.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={<div className="bg-surface-secondary h-48 animate-pulse rounded-lg" />}
            >
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        {/* Credenciais de demonstração (apenas em dev) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="border-info/30 bg-info-light/50 text-info rounded-lg border p-3 text-center text-xs">
            <p className="font-medium">Credenciais de demonstração:</p>
            <p className="mt-1 font-mono">dono@demo.com / SenhaDemo123!</p>
          </div>
        )}
      </div>
    </main>
  );
}
