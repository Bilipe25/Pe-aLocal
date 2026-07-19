import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Ajuda para acessar',
  description: 'Orientações para acessar o painel do estabelecimento no PedidoLocal.',
};

export default function AccessHelpPage() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader className="text-center">
        <p className="text-text-secondary text-sm font-medium">Acesso para estabelecimentos</p>
        <CardTitle className="font-display text-2xl">
          <h1 className="text-balance">Como conseguir acesso</h1>
        </CardTitle>
        <CardDescription>
          O painel é reservado às pessoas cadastradas pela sua loja.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <section aria-labelledby="returning-access-title">
          <h2 id="returning-access-title" className="text-text-primary font-semibold">
            Já acessou antes?
          </h2>
          <p className="text-text-secondary mt-1 text-sm leading-6 text-pretty">
            Use o mesmo e-mail cadastrado. Se não lembrar a senha, solicite novas instruções.
          </p>
          <Button asChild variant="outline" className="mt-3 w-full">
            <Link href="/forgot-password">Redefinir minha senha</Link>
          </Button>
        </section>

        <section aria-labelledby="first-access-title" className="border-border border-t pt-5">
          <h2 id="first-access-title" className="text-text-primary font-semibold">
            É seu primeiro acesso?
          </h2>
          <p className="text-text-secondary mt-1 text-sm leading-6 text-pretty">
            Peça ao responsável pelo estabelecimento para cadastrar ou reativar sua participação
            usando exatamente o seu e-mail. Essa confirmação protege os dados da loja.
          </p>
        </section>

        <Button asChild className="w-full" size="lg">
          <Link href="/login">Voltar ao login</Link>
        </Button>
        <Link
          href="/"
          className="text-text-secondary hover:text-text-primary flex min-h-11 items-center justify-center text-center text-sm underline-offset-4 hover:underline"
        >
          Ir para a página inicial
        </Link>
      </CardContent>
    </Card>
  );
}
