'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './config';

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(url, publishableKey, {
    cookieOptions: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
}
