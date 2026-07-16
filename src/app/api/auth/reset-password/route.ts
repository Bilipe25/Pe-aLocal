import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { message: 'A senha deve ter entre 8 e 128 caracteres.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) {
    return Response.json(
      { message: 'O link de recuperação expirou.' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  return Response.json(
    error
      ? { message: 'Não foi possível atualizar a senha.' }
      : { message: 'Senha atualizada com sucesso.' },
    {
      status: error ? 400 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
