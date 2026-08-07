import { NextResponse } from 'next/server';
import { getCustomerOrderDetails } from '@/server/services/customer-order-tracking.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { searchParams } = new URL(request.url);
  const storeSlug = searchParams.get('storeSlug');

  if (!storeSlug) {
    return NextResponse.json({ message: 'storeSlug é obrigatório.' }, { status: 400 });
  }

  const details = await getCustomerOrderDetails(token, storeSlug);

  if (!details) {
    return NextResponse.json({ message: 'Pedido não encontrado.' }, { status: 404 });
  }

  return NextResponse.json(details, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
