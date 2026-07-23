import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StorefrontError from '@/app/[storeSlug]/error';
import StorefrontNotFound, {
  metadata as storefrontNotFoundMetadata,
} from '@/app/[storeSlug]/not-found';

describe('estados do segmento público da loja', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('oferece recuperação sem revelar mensagem ou stack do erro', async () => {
    const reset = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('telefone=11999999999 token=secreto'), {
      digest: 'digest-tecnico',
    });

    render(<StorefrontError error={error} reset={reset} />);

    expect(
      screen.getByRole('heading', { name: 'Não foi possível carregar esta loja' }),
    ).toBeVisible();
    expect(screen.queryByText(/11999999999|secreto/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalledOnce();

    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('[STOREFRONT_SEGMENT_ERROR]', {
        digest: 'digest-tecnico',
      }),
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('11999999999');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secreto');
  });

  it('renderiza 404 neutro, seguro e não indexável', () => {
    render(<StorefrontNotFound />);

    expect(screen.getByRole('heading', { name: 'Não encontramos esta página' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    expect(storefrontNotFoundMetadata.robots).toEqual({ index: false, follow: false });
  });
});
