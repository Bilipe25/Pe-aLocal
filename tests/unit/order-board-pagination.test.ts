import { describe, expect, it } from 'vitest';

import {
  appendLanePage,
  emptyLanePagination,
  laneCursorForPagination,
  lanePaginationForRevision,
  resetChangedLanePages,
  type LanePaginationState,
} from '@/components/dashboard/order-board-pagination';
import type { OrderQueueItemDTO } from '@/types/order-query';

function order(id: string): OrderQueueItemDTO {
  return {
    id,
    orderNumber: Number(id.replace(/\D/g, '')) || 1,
    customerDisplayName: 'Cliente',
    modality: 'PICKUP',
    diningTableLabel: null,
    paymentMethod: 'PIX',
    paymentStatus: 'PAID',
    status: 'PENDING',
    total: 2500,
    itemCount: 1,
    createdAt: '2026-07-31T12:00:00.000Z',
    statusChangedAt: '2026-07-31T12:00:00.000Z',
    stageStartedAt: '2026-07-31T12:00:00.000Z',
    stageLabel: 'Recebido',
    stageAlerts: [],
    nextActionLabel: 'Aceitar pedido',
    version: 1,
    hasCustomerNotes: false,
    hasOperationalAlert: false,
  };
}

const pagination: LanePaginationState = {
  revision: 3,
  items: { NEW: [order('order-9')] },
  cursors: { NEW: 'cursor-2' },
  loadingLanes: {},
  errorLanes: {},
};

describe('paginação resiliente do board', () => {
  it('preserva páginas carregadas durante refetches do mesmo filtro', () => {
    expect(lanePaginationForRevision(pagination, 3)).toBe(pagination);
  });

  it('descarta páginas ao trocar filtros e ignora resposta da revisão anterior', () => {
    const next = lanePaginationForRevision(pagination, 4);
    expect(next.items).toEqual({});
    expect(appendLanePage(next, 3, 'NEW', [order('order-10')], null)).toBe(next);
  });

  it('remove somente pedidos alterados antes da reconciliação em tempo real', () => {
    const current = appendLanePage(pagination, 3, 'NEW', [order('order-10')], null);
    const reset = resetChangedLanePages(current, ['order-9']);
    expect(reset.items.NEW).toBeUndefined();
    expect(reset.cursors).not.toHaveProperty('NEW');
    expect(laneCursorForPagination(reset, 3, 'NEW', 'cursor-atualizado')).toBe('cursor-atualizado');
  });

  it('preserva as outras colunas ao reconciliar uma pagina extra', () => {
    const current: LanePaginationState = {
      ...pagination,
      items: { NEW: [order('order-9')], PREPARATION: [order('order-20')] },
      cursors: { NEW: null, PREPARATION: 'cursor-preparation' },
    };
    const reset = resetChangedLanePages(current, ['order-9']);

    expect(reset.items.PREPARATION?.map((item) => item.id)).toEqual(['order-20']);
    expect(reset.cursors.PREPARATION).toBe('cursor-preparation');
  });

  it('cria estado vazio consistente para refresh manual', () => {
    expect(emptyLanePagination(8)).toEqual({
      revision: 8,
      items: {},
      cursors: {},
      loadingLanes: {},
      errorLanes: {},
    });
  });

  it('preserva o fim da paginação sem reutilizar o cursor inicial', () => {
    const exhausted = appendLanePage(pagination, 3, 'NEW', [order('order-10')], null);

    expect(laneCursorForPagination(exhausted, 3, 'NEW', 'cursor-inicial')).toBeNull();
    expect(laneCursorForPagination(exhausted, 3, 'PREPARATION', 'cursor-preparacao')).toBe(
      'cursor-preparacao',
    );
    expect(laneCursorForPagination(exhausted, 4, 'NEW', 'cursor-nova-revisao')).toBe(
      'cursor-nova-revisao',
    );
  });
});
