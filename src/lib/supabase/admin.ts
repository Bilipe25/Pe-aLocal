import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from './config';

export function createAdminClient() {
  const { url } = getSupabasePublicConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY é obrigatória para operações administrativas.');
  }

  return createSupabaseClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
