import 'server-only';

import { getMercadoPagoSellerProfile } from '@/lib/mercado-pago/client';
import { getMercadoPagoConfig, getMercadoPagoTestAccessToken } from '@/lib/mercado-pago/config';
import { getDb } from '@/server/database/client';
import { NotFoundError } from '@/server/errors';
import { getMercadoPagoAccessToken } from './mercado-pago-connection.service';

export interface MercadoPagoOrdersCredential {
  accessToken: string;
  expectedProviderUserId: string;
  source: 'OAUTH' | 'APPLICATION_TEST';
}

let sandboxCredentialCache: {
  accessToken: string;
  promise: Promise<MercadoPagoOrdersCredential>;
} | null = null;

async function loadSandboxCredential(accessToken: string): Promise<MercadoPagoOrdersCredential> {
  const seller = await getMercadoPagoSellerProfile({ accessToken });
  return {
    accessToken,
    expectedProviderUserId: seller.id,
    source: 'APPLICATION_TEST',
  };
}

export async function getMercadoPagoOrdersCredential(
  connectionId: string,
  options: { forceRefresh?: boolean; allowReconciliation?: boolean } = {},
): Promise<MercadoPagoOrdersCredential> {
  const config = getMercadoPagoConfig();
  if (config.oauthEnvironment === 'sandbox') {
    const accessToken = getMercadoPagoTestAccessToken();
    if (sandboxCredentialCache?.accessToken !== accessToken) {
      const promise = loadSandboxCredential(accessToken).catch((error) => {
        if (sandboxCredentialCache?.promise === promise) sandboxCredentialCache = null;
        throw error;
      });
      sandboxCredentialCache = { accessToken, promise };
    }
    return sandboxCredentialCache.promise;
  }

  const connection = await getDb().storePaymentProviderConnection.findUnique({
    where: { id: connectionId },
    select: { providerUserId: true },
  });
  if (!connection) throw new NotFoundError('Conexão Mercado Pago');
  const accessToken = await getMercadoPagoAccessToken(connectionId, options);
  return {
    accessToken,
    expectedProviderUserId: connection.providerUserId,
    source: 'OAUTH',
  };
}
