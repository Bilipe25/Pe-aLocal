/**
 * Indica que o código está executando em um build implantado.
 *
 * `.env.local` pode apontar para dados de staging durante o `next dev`. Nesse
 * caso, os bindings do Cloudflare não existem e não devem ser tratados como
 * ausentes em um deploy real. O modo estrito continua obrigatório nos builds
 * de staging e produção.
 */
export function isDeployedRuntime() {
  return (
    process.env.NODE_ENV === 'production' &&
    (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production')
  );
}
