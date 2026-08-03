import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderCard, type OrderCardData } from '@/components/dashboard/order-card';

const order: OrderCardData = {
  id: 'order-1',
  orderNumber: 1042,
  customerDisplayName: 'Mariana Souza',
  modality: 'DELIVERY',
  paymentMethod: 'PIX',
  paymentStatus: 'PAID',
  status: 'PENDING',
  total: 6890,
  itemCount: 4,
  createdAt: '2026-07-31T12:00:00.000Z',
  statusChangedAt: '2026-07-31T12:00:00.000Z',
  stageStartedAt: '2026-07-31T12:00:00.000Z',
  stageElapsedMinutes: 17,
  stageLabel: 'Recebido',
  stageAlerts: [],
  nextActionLabel: 'Aceitar pedido',
  version: 1,
  hasCustomerNotes: false,
  hasOperationalAlert: false,
  itemPreview: [
    { id: 'item-1', productName: 'Brasa Burger', quantity: 1, notes: 'Sem cebola' },
    { id: 'item-2', productName: 'Batata rústica', quantity: 1, notes: null },
    { id: 'item-3', productName: 'Coca-Cola', quantity: 1, notes: null },
    { id: 'item-4', productName: 'Sobremesa', quantity: 1, notes: null },
  ],
  promisedFulfillmentMinAt: '2026-07-31T12:30:00.000Z',
  promisedFulfillmentMaxAt: '2026-07-31T12:45:00.000Z',
};

describe('OrderCard operacional', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:17:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mantém o card sem controles aninhados e abre os detalhes por um trigger separado', () => {
    const onClick = vi.fn();
    render(
      <OrderCard
        order={order}
        onClick={onClick}
        footer={<button type="button">Aceitar pedido</button>}
      />,
    );

    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByText('Brasa Burger')).toBeInTheDocument();
    expect(screen.getByText('Batata rústica')).toBeInTheDocument();
    expect(screen.getByText('Coca-Cola')).toBeInTheDocument();
    expect(screen.queryByText('Sobremesa')).not.toBeInTheDocument();
    expect(screen.getByText('+ mais itens no pedido')).toBeInTheDocument();
    expect(screen.getByText('Sem cebola')).toBeInTheDocument();
    expect(screen.getByText('há 17 min')).toBeInTheDocument();
    expect(screen.getByText(/^Previsão \d/)).toBeInTheDocument();

    const detailTrigger = screen.getByRole('button', { name: 'Abrir pedido 1042' });
    expect(detailTrigger).toHaveAttribute('id', 'order-card-trigger-order-1');
    expect(detailTrigger).toHaveAttribute('aria-controls', 'order-details-panel');
    fireEvent.click(detailTrigger);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('oferece uma hierarquia mobile compacta sem remover os detalhes do desktop', () => {
    render(
      <OrderCard
        order={order}
        onClick={vi.fn()}
        footer={<button type="button">Aceitar pedido</button>}
      />,
    );

    const article = screen.getByRole('article');
    const preview = screen.getByRole('list', { name: 'Prévia dos itens' });
    const previewItems = preview.querySelectorAll('.order-card-item');

    expect(previewItems).toHaveLength(3);
    expect(previewItems[2]).toHaveClass('order-card-item-mobile-hidden');
    expect(screen.getByText('+ 2 itens')).toHaveClass('order-card-more-mobile');
    expect(screen.getByText('+ mais itens no pedido')).toHaveClass('order-card-more-desktop');
    expect(screen.getByText('Obs:')).toHaveClass('sm:hidden');
    expect(screen.getByText(/Pix/).closest('.order-card-meta-payment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar pedido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir pedido 1042' })).toBeInTheDocument();
    expect(article.querySelector('button button')).not.toBeInTheDocument();
  });

  it('resume a quantidade quando a prévia de produtos não está disponível', () => {
    render(
      <OrderCard order={{ ...order, itemCount: 1, itemPreview: undefined }} onClick={vi.fn()} />,
    );

    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Prévia dos itens' })).not.toBeInTheDocument();
  });

  it('amadurece alerta temporal no próprio card sem refetch do board', () => {
    render(
      <OrderCard
        order={{
          ...order,
          paymentMethod: 'CASH',
          status: 'PENDING',
          createdAt: '2026-07-31T12:15:00.000Z',
          stageStartedAt: '2026-07-31T12:15:00.000Z',
          stageElapsedMinutes: 2,
          stageAlerts: [],
          hasOperationalAlert: false,
        }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Sem aceite há/)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText('Aceite atingiu o limite de 3 min')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveClass('order-card-operational');
  });

  it('usa o limite configurado pela loja sem congelar o alerta de preparo', () => {
    render(
      <OrderCard
        order={{
          ...order,
          paymentMethod: 'CASH',
          status: 'PREPARING',
          stageStartedAt: '2026-07-31T11:28:00.000Z',
          stageElapsedMinutes: 49,
          stageAlertThresholdMinutes: 50,
          stageAlerts: [],
          hasOperationalAlert: false,
        }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText('Preparo atingiu o limite de 50 min')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Preparo atingiu o limite de 50 min')).toBeInTheDocument();
  });

  it('resume tempos extremos e deixa nomes longos quebrarem em duas linhas', () => {
    const customerDisplayName = 'Mariana de Souza Albuquerque dos Santos';
    render(
      <OrderCard
        order={{
          ...order,
          customerDisplayName,
          paymentMethod: 'CASH',
          stageStartedAt: '2026-07-28T13:07:00.000Z',
          stageElapsedMinutes: 4_270,
        }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('há 2 dias e 23 horas')).toBeInTheDocument();
    expect(screen.getByText(customerDisplayName)).toHaveClass('line-clamp-2', 'break-words');
  });

  it('explicita quando a previsão já venceu', () => {
    render(
      <OrderCard
        order={{
          ...order,
          promisedFulfillmentMinAt: '2026-07-31T12:00:00.000Z',
          promisedFulfillmentMaxAt: '2026-07-31T12:10:00.000Z',
        }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Previsão vencida há 7 min')).toHaveClass(
      'text-error',
      'order-card-promised',
    );
    expect(screen.getByText('Previsão vencida há 7 min')).toHaveAttribute(
      'data-order-promised-overdue',
      'true',
    );
  });
});
