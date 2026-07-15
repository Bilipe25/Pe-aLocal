import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { message: 'Informe um e-mail válido.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const limiter = getRateLimiter();
  const limit = await limiter.check({
    identifier: `password-recovery:${ip}:${email}`,
    ...RATE_LIMITS.passwordRecovery,
  });

  if (limit.allowed) {
    const supabase = await createClient();
    const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
    });
  }

  // Resposta uniforme para impedir enumeração de e-mails.
  return Response.json(
    { message: 'Se a conta existir, enviaremos as instruções de recuperação.' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
