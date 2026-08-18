import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireTenantStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import {
  errorToResponse,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '@/server/errors';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { rememberActiveStore } from '@/server/services/store-context.service';

const querySchema = z.object({ store: z.string().uuid(), order: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      store: url.searchParams.get('store'),
      order: url.searchParams.get('order'),
    });
    if (!parsed.success) throw new ValidationError('Destino do pedido invÃ¡lido.');
    const context = await requireTenantStoreAccess(parsed.data.store, Permission.VIEW_ORDERS);
    if (!hasTenantPermission(context.session.tenantRole, Permission.VIEW_ORDER_DETAILS)) {
      throw new AuthorizationError('Seu perfil nÃ£o pode abrir os detalhes deste pedido.');
    }
    const order = await getDb().order.findFirst({
      where: {
        id: parsed.data.order,
        tenantId: context.session.tenantId,
        storeId: context.store.id,
      },
      select: { id: true },
    });
    if (!order) throw new NotFoundError('Pedido');
    await rememberActiveStore(context.store.id);
    const destination = new URL('/dashboard/orders', request.url);
    destination.searchParams.set('order', order.id);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      const url = new URL(request.url);
      const destination = new URL('/login', request.url);
      destination.searchParams.set('redirect', `${url.pathname}${url.search}`);
      return NextResponse.redirect(destination, 303);
    }
    return errorToResponse(error);
  }
}
