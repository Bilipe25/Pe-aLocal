import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollToTop } from '@/components/storefront/scroll-to-top';

const scrollTo = vi.fn();
const matchMedia = vi.fn();

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  });
}

describe('voltar ao topo do storefront', () => {
  beforeEach(() => {
    scrollTo.mockReset();
    matchMedia.mockReset();
    setScrollY(0);
    vi.stubGlobal('scrollTo', scrollTo);
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => window.clearTimeout(frameId));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sincroniza a posição inicial e reage ao limite de rolagem', async () => {
    setScrollY(480);
    render(<ScrollToTop />);
    const button = screen.getByRole('button', { name: 'Voltar ao topo' });

    await waitFor(() => expect(button).toHaveClass('is-visible'));

    setScrollY(200);
    fireEvent.scroll(window);
    await waitFor(() => expect(button).not.toHaveClass('is-visible'));
  });

  it('respeita a preferência de movimento ao retornar ao topo', async () => {
    setScrollY(480);
    matchMedia.mockReturnValueOnce({ matches: false }).mockReturnValueOnce({ matches: true });
    render(<ScrollToTop />);
    const button = screen.getByRole('button', { name: 'Voltar ao topo' });

    await waitFor(() => expect(button).toHaveClass('is-visible'));
    fireEvent.click(button);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });
});
