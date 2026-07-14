import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Health check endpoint para monitoramento e verificação de deploy.
 * Retorna status da aplicação sem verificar dependências externas.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
