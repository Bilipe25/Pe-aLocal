import type { MetadataRoute } from 'next';

import { buildGlobalManifest } from '@/lib/pwa/manifest';

export default function manifest(): MetadataRoute.Manifest {
  return buildGlobalManifest();
}
