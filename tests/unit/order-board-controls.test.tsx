import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OrderBoardMetrics } from '@/components/dashboard/order-board-metrics';
import { OrderFilters } from '@/components/dashboard/order-filters';
import { OrderLaneLoadMoreButton } from '@/components/dashboard/order-lane-load-more-button';

describe('controles do board operacional', () => {
  it('expõe os cinco KPIs reais como filtros acessíveis', () => {
    const onSelect = vi.fn();
    render(
      <OrderBoardMetrics
        summary={{
          newCount: 8,
          preparingCount: 12,
          readyCount: 6,
          deliveryCount: 5,
          delayedCount: 3,
        }}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('region', { name: 'Resumo operacional' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novos pedidos/ })).toHaveTextContent('8');
    expect(screen.getByRole('button', { name: /Em preparo/ })).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: /Prontos/ })).toHaveTextContent('6');
    expect(screen.getByRole('button', { name: /Em entrega/ })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: /Atrasados/ })).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('button', { name: /Atrasados/ }));
    expect(onSelect).toHaveBeenCalledWith({ statuses: undefined, delayedOnly: true });
  });

  it('limpa o filtro de atraso ao selecionar uma etapa explícita', () => {
    const onChange = vi.fn();
    render(
      <OrderFilters
        filters={{ localDate: '2026-07-31', delayedOnly: true }}
        localDate="2026-07-31"
        timeZone="America/Fortaleza"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Novos' }));
    expect(onChange).toHaveBeenCalledWith({
      localDate: '2026-07-31',
      delayedOnly: false,
      statuses: ['PENDING'],
    });
  });

  it('oferece Mais pedidos no rodapé da coluna quando existe outra página', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <OrderLaneLoadMoreButton
        laneTitle="Novos pedidos"
        loadedCount={10}
        totalCount={36}
        isLoading={false}
        disabled={false}
        onLoadMore={onLoadMore}
      />,
    );

    const button = screen.getByRole('button', { name: 'Mais pedidos em Novos pedidos' });
    expect(button).toHaveTextContent('Mais pedidos · 10 de 36');
    fireEvent.click(button);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <OrderLaneLoadMoreButton
        laneTitle="Novos pedidos"
        loadedCount={10}
        totalCount={36}
        isLoading
        disabled
        onLoadMore={onLoadMore}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Carregando mais pedidos em Novos pedidos' }),
    ).toBeDisabled();
  });
});
