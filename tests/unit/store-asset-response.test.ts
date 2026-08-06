import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bucket: { get: vi.fn() },
  images: {
    input: vi.fn(),
  },
  getStoreAssetRuntime: vi.fn(),
}));

vi.mock('@/server/storage/store-assets', () => ({
  getStoreAssetRuntime: mocks.getStoreAssetRuntime,
}));

import { serveStoreAsset } from '@/server/storage/store-asset-response';

const asset = {
  objectKey: 'tenants/t/s/p/abc.webp',
  mimeType: 'image/webp',
  width: 800,
  height: 800,
};

function buildRuntime() {
  const transformed = {
    response: () => new Response('transformed-body', { status: 200 }),
  };
  mocks.images.input.mockReturnValue({
    transform: vi.fn().mockReturnThis(),
    output: vi.fn().mockResolvedValue(transformed),
  });
  mocks.getStoreAssetRuntime.mockResolvedValue({
    bucket: mocks.bucket,
    images: mocks.images,
  });
}

function r2Object(etag: string, size = 4096) {
  return {
    body: 'binary-stream',
    httpEtag: etag,
    etag,
    size,
    writeHttpMetadata: vi.fn(),
  };
}

describe('serveStoreAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildRuntime();
  });

  it('rejeita largura não permitida com 400', async () => {
    const request = new Request('http://localhost/api/store-assets/abc?width=128');
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(400);
    expect(mocks.bucket.get).not.toHaveBeenCalled();
  });

  it('gera AVIF quando o cliente envia Accept: image/avif', async () => {
    mocks.bucket.get.mockReturnValue(r2Object('"etag-abc"'));
    const request = new Request('http://localhost/api/store-assets/abc?width=384', {
      headers: { Accept: 'image/avif,image/webp,*/*' },
    });
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/avif');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(response.headers.get('etag')).toBe('"etag-abc-w384-image/avif"');
    expect(mocks.images.input).toHaveBeenCalledWith('binary-stream');
  });

  it('gera WebP por padrão quando só WebP é aceito', async () => {
    mocks.bucket.get.mockReturnValue(r2Object('"etag-abc"'));
    const request = new Request('http://localhost/api/store-assets/abc?width=384', {
      headers: { Accept: 'image/webp,*/*' },
    });
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toBe('"etag-abc-w384-image/webp"');
  });

  it('responde 304 quando If-None-Match casa com etag composto', async () => {
    mocks.bucket.get.mockReturnValue(r2Object('"etag-abc"'));
    const request = new Request('http://localhost/api/store-assets/abc?width=384', {
      headers: {
        Accept: 'image/avif',
        'If-None-Match': '"etag-abc-w384-image/avif"',
      },
    });
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"etag-abc-w384-image/avif"');
    expect(response.headers.get('vary')).toBe('Accept');
    expect(mocks.images.input).not.toHaveBeenCalled();
  });

  it('entrega o asset original sem transformação quando width não é informado', async () => {
    mocks.bucket.get.mockReturnValue(r2Object('"etag-orig"', 12_345));
    const request = new Request('http://localhost/api/store-assets/abc');
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('etag')).toBe('"etag-orig"');
    expect(response.headers.get('vary')).toBeNull();
    expect(response.headers.get('content-length')).toBe('12345');
    expect(mocks.images.input).not.toHaveBeenCalled();
  });

  it('retorna 404 quando o objeto não existe no R2', async () => {
    mocks.bucket.get.mockReturnValue(null);
    const request = new Request('http://localhost/api/store-assets/abc?width=384');
    const response = await serveStoreAsset(request, asset, 'public, max-age=86400, immutable');

    expect(response.status).toBe(404);
  });
});