import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkStatus } from '@/components/storefront/network-status';

describe('NetworkStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não renderiza nada quando está online', () => {
    render(<NetworkStatus />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('exibe aviso de offline quando navigator.onLine é falso', () => {
    vi.stubGlobal('navigator', { onLine: false });
    render(<NetworkStatus />);

    const status = screen.getByRole('status');
    expect(status).toHaveClass('is-offline');
    expect(screen.getByText('Sem internet')).toBeInTheDocument();
    expect(
      screen.getByText('Verifique sua conexão para garantir que os dados estejam atualizados.'),
    ).toBeInTheDocument();
  });

  it('reage a eventos online/offline do navegador', () => {
    vi.stubGlobal('navigator', { onLine: true });
    render(<NetworkStatus />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('status')).toHaveClass('is-offline');
    expect(screen.getByText('Sem internet')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByRole('status')).toHaveClass('is-reconnecting');
    expect(screen.getByText('Conexão restabelecida')).toBeInTheDocument();
  });

  it('esconde o banner de reconexão após um curto delay', () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: false });
    render(<NetworkStatus />);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByText('Conexão restabelecida')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
