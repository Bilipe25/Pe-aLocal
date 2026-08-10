import { getAdminAuditExportData } from '@/server/services/admin.service';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { logs } = await getAdminAuditExportData({
    query: url.searchParams.get('query') ?? undefined,
    action: url.searchParams.get('action') ?? undefined,
  });
  const header = [
    'data',
    'acao',
    'entidade',
    'entidade_id',
    'estabelecimento',
    'loja',
    'usuario',
    'metadata',
  ];
  const rows = logs.map((log) => [
    log.createdAt.toISOString(),
    log.action,
    log.entity,
    log.entityId,
    log.tenant?.name,
    log.store ? `${log.store.name} (/${log.store.slug})` : null,
    log.user?.email ?? 'Sistema',
    log.metadata ? JSON.stringify(log.metadata) : null,
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidolocal-auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
