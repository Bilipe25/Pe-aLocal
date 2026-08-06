import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

// `next/image` em jsdom não lê `next.config.ts`, caindo no loader default que
// tenta `new URL(...)` sobre identificadores de asset (ex.: UUIDs) e quebra os
// testes. Mockamos o componente para usar o mesmo loader custom da produção
// (`cloudflareImagesLoader`), preservando `src`, `srcset`, `sizes`, `loading`,
// `fill`, `priority`, `onLoad` e `onError` — o suficiente para os testes de
// storefront validarem contratos de imagem sem depender do runtime do Next.
vi.mock('next/image', () => {
  const STOREFRONT_IMAGE_DEVICE_SIZES = [96, 192, 384, 768, 1280] as const;

  function buildLoaderUrl(loaderSrc: string, width: number): string {
    const isAssetId = !/:/.test(loaderSrc) && !loaderSrc.startsWith('/');
    if (!isAssetId) return loaderSrc;
    const base = `/api/store-assets/${encodeURIComponent(loaderSrc)}`;
    return `${base}?width=${width}`;
  }

  function buildSrcSet(loaderSrc: string, sizes?: string): string | undefined {
    if (!sizes) return undefined;
    return STOREFRONT_IMAGE_DEVICE_SIZES.map(
      (w) => `${buildLoaderUrl(loaderSrc, w)} ${w}w`,
    ).join(', ');
  }

  type MockImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    fill?: boolean;
    priority?: boolean;
    loader?: (props: { src: string; width: number; quality?: number }) => string;
    quality?: number;
  };

  function MockedImage({
    src,
    alt,
    width,
    height,
    sizes,
    fill,
    loading,
    priority,
    loader,
    quality,
    onLoad,
    onError,
    className,
    ...rest
  }: MockImageProps) {
    const resolvedSrc = loader
      ? loader({ src, width: 384, quality })
      : buildLoaderUrl(src, 384);
    const srcSet = loader
      ? STOREFRONT_IMAGE_DEVICE_SIZES.map((w) => `${loader({ src, width: w, quality })} ${w}w`).join(', ')
      : buildSrcSet(src, sizes);
    const style = fill
      ? { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', objectFit: 'cover' as const }
      : width && height
        ? { width, height }
        : undefined;
    return React.createElement('img', {
      ...rest,
      src: resolvedSrc,
      srcSet,
      sizes,
      alt,
      width: fill ? undefined : width,
      height: fill ? undefined : height,
      loading: loading ?? 'lazy',
      fetchPriority: priority ? 'high' : undefined,
      className,
      style,
      onLoad,
      onError,
    });
  }

  return { default: MockedImage };
});