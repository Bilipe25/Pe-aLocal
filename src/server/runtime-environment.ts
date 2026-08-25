/**
 * Indica que o código está executando em um build implantado.
 *
 * `.env.local` pode apontar para dados de staging durante o `next dev`. Nesse
 * caso, os bindings do Cloudflare não existem e não devem ser tratados como
 * ausentes em um deploy real. O modo estrito continua obrigatório nos builds
 * de staging e produção.
 */
function hasPublishedRuntimeMarker() {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return (
    userAgent === 'Cloudflare-Workers' ||
    process.env.CF_PAGES === '1' ||
    process.env.WORKERS_CI === '1'
  );
}

export function isDeployedRuntime() {
  if (hasPublishedRuntimeMarker()) return true;
  return (
    process.env.NODE_ENV === 'production' &&
    (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production')
  );
}

export function isLocalDevelopmentRuntime() {
  const appEnvironment = String(process.env.APP_ENV ?? '');
  return (
    !hasPublishedRuntimeMarker() &&
    appEnvironment === 'development' &&
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
  );
}
