import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductImageUpload } from '@/features/catalog/components/product-image-upload';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('@/features/catalog/actions', () => ({
  removeProductImageAction: vi.fn(),
}));

describe('ProductImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:product-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envia somente uma requisição quando o evento de arquivo é disparado novamente', async () => {
    render(
      <ProductImageUpload
        productId="00000000-0000-0000-0002-000000000003"
        productName="X-Salada"
      />,
    );

    const input = screen.getByLabelText('Selecionar imagem do produto');
    const file = new File(['jpeg'], 'x-salada.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
