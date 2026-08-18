import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  OrderBoardMetrics,
  OrderMobileStageSelector,
} from '@/components/dashboard/order-board-metrics';
import { OrderBoardViewTabs, OrderFilters } from '@/components/dashboard/order-filters';
import { OrderLaneLoadMoreButton } from '@/components/dashboard/order-lane-load-more-button';

function MobileOrderFiltersHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        id="orders-mobile-filter-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="orders-mobile-filter-sheet"
        onClick={() => setOpen(true)}
      >
        Abrir filtros avançados
      </button>
      <OrderFilters
        filters={{
          localDate: '2026-07-31',
          statuses: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
        }}
        localDate="2026-07-31"
        timeZone="America/Fortaleza"
        historyMode={false}
        mobileOpen={open}
        onMobileOpenChange={setOpen}
        onChange={vi.fn()}
      />
    </>
  );
}

describe('controles do board operacional', () => {
  const summary = {
    newCount: 1,
    preparingCount: 12,
    readyCount: 6,
    deliveryCount: 5,
    delayedCount: 3,
  };

  it('expõe os cinco KPIs reais como resumo compacto e com pluralização correta', () => {
    render(<OrderBoardMetrics summary={summary} />);

    expect(screen.getByRole('region', { name: 'Resumo operacional' })).toBeInTheDocument();
    expect(screen.getByLabelText('1 pedido novo')).toHaveTextContent('1');
    expect(screen.getByLabelText('12 pedidos em preparo')).toHaveTextContent('12');
    expect(screen.getByLabelText('6 pedidos prontos')).toHaveTextContent('6');
    expect(screen.getByLabelText('5 pedidos em entrega')).toHaveTextContent('5');
    expect(screen.getByLabelText('3 pedidos com atenção')).toHaveTextContent('3');
    expect(screen.queryByRole('button', { name: /Novos/ })).not.toBeInTheDocument();
  });

  it('usa um único seletor de etapa no mobile e combina prontos com entregas', () => {
    const onChange = vi.fn();
    render(<OrderMobileStageSelector summary={summary} value="NEW" onChange={onChange} />);

    expect(screen.getByRole('button', { name: /Novos/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('11 pedidos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Saída/ }));
    expect(onChange).toHaveBeenCalledWith('READY_AND_DELIVERY');
  });

  it('agrupa pagamento, modalidade e atraso em filtros avançados', () => {
    const onChange = vi.fn();
    render(
      <OrderFilters
        filters={{
          localDate: '2026-07-31',
          statuses: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'],
          delayedOnly: true,
        }}
        localDate="2026-07-31"
        timeZone="America/Fortaleza"
        historyMode={false}
        mobileOpen={false}
        onMobileOpenChange={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Filtros avançados')).toBeInTheDocument();
    expect(screen.getByLabelText('1 filtro ativo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novos' })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Mostrar somente pedidos que precisam de atenção',
      }),
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ delayedOnly: undefined }));
  });

  it('abre e fecha o bottom sheet mobile restaurando o foco no gatilho', async () => {
    const { container } = render(<MobileOrderFiltersHarness />);
    const trigger = screen.getByRole('button', { name: 'Abrir filtros avançados' });

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Filtros avançados' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Pagamento', { selector: '#orders-mobile-filter-payment' })).toBe(
      document.activeElement,
    );
    expect(container.querySelectorAll('#orders-inline-filter-payment')).toHaveLength(1);
    expect(document.querySelectorAll('#orders-mobile-filter-payment')).toHaveLength(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Filtros avançados' })).not.toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('separa a operação do histórico sem misturar finalizados no kanban ativo', () => {
    const onChange = vi.fn();
    render(<OrderBoardViewTabs historyMode={false} activeOrderCount={1} onChange={onChange} />);

    expect(screen.getByLabelText('1 pedido ativo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Em andamento/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));
    expect(onChange).toHaveBeenCalledWith(true);
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
