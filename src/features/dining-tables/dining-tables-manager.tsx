'use client';

import encodeQR from 'qr';
import { Download, Eye, Pencil, Plus, Printer, RefreshCw, ToggleLeft } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  createDiningTablesBatchAction,
  renameDiningTableAction,
  rotateDiningTableTokenAction,
  setDiningTableActiveAction,
} from '@/features/dining-tables/actions';

interface DiningTableItem {
  id: string;
  label: string;
  sortOrder: number;
  publicToken: string;
  isActive: boolean;
  version: number;
}

function qrSvg(url: string) {
  return encodeQR(url, 'svg');
}

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '') || 'mesa'
  );
}

async function downloadPng(svg: string, filename: string) {
  const image = new Image();
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível preparar a imagem.'));
      image.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível gerar o PNG.');
    downloadBlob(blob, 'image/png', filename);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function DiningTablesManager({
  storeId,
  storeName,
  enabled,
  canManage,
  initialTables,
  siteOrigin,
}: {
  storeId: string;
  storeName: string;
  enabled: boolean;
  canManage: boolean;
  initialTables: DiningTableItem[];
  siteOrigin: string;
}) {
  const [tables, setTables] = useState(initialTables);
  const [prefix, setPrefix] = useState('Mesa');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(12);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [printTarget, setPrintTarget] = useState<string | 'ALL' | null>(null);
  const [rotationReceipt, setRotationReceipt] = useState<{ tableId: string; at: Date } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const printableTables = useMemo(() => tables.filter((table) => table.isActive), [tables]);

  function print(target: string | 'ALL') {
    setPrintTarget(target);
    window.setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 50);
  }

  async function createBatch() {
    const result = await createDiningTablesBatchAction(storeId, { prefix, start, count });
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    setTables((current) => [...current, ...result.data.tables]);
    setStart(start + count);
    toast.success(`${result.data.tables.length} mesas criadas.`);
    return true;
  }

  function rename(table: DiningTableItem) {
    startTransition(async () => {
      const result = await renameDiningTableAction(storeId, {
        tableId: table.id,
        expectedVersion: table.version,
        label: editingLabel,
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setTables((current) =>
        current.map((item) => (item.id === table.id ? { ...item, ...result.data.table } : item)),
      );
      setEditingId(null);
      toast.success('Mesa renomeada. Pedidos antigos mantêm o nome original.');
    });
  }

  async function toggle(table: DiningTableItem) {
    const result = await setDiningTableActiveAction(storeId, {
      tableId: table.id,
      expectedVersion: table.version,
      isActive: !table.isActive,
    });
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    setTables((current) =>
      current.map((item) => (item.id === table.id ? { ...item, ...result.data.table } : item)),
    );
    toast.success(table.isActive ? 'Mesa desativada.' : 'Mesa reativada.');
  }

  async function rotate(table: DiningTableItem) {
    const result = await rotateDiningTableTokenAction(storeId, {
      tableId: table.id,
      expectedVersion: table.version,
    });
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    setTables((current) =>
      current.map((item) => (item.id === table.id ? { ...item, ...result.data.table } : item)),
    );
    setRotationReceipt({ tableId: table.id, at: new Date() });
    toast.success('QR Code rotacionado. O anterior deixou de funcionar.');
    return true;
  }

  if (!enabled) {
    return (
      <section className="border-border bg-surface max-w-3xl rounded-xl border p-5" role="status">
        <h2 className="text-text-primary text-lg font-bold">Recurso ainda não habilitado</h2>
        <p className="text-text-secondary mt-2 text-sm">
          O Pedido por QR Code no salão está desligado para esta loja. Nenhuma mesa pode ser criada
          até que o entitlement seja habilitado pela administração da plataforma.
        </p>
      </section>
    );
  }

  return (
    <div
      className="dining-tables-admin max-w-6xl"
      data-print-target={printTarget ?? undefined}
      data-print-mode={printTarget === 'ALL' ? 'A4' : printTarget ? 'A6' : undefined}
    >
      {canManage ? (
        <section className="dining-tables-batch" aria-labelledby="dining-batch-title">
          <div>
            <h2 id="dining-batch-title">Criar mesas em lote</h2>
            <p>Comece com 12 mesas ou ajuste a sequência ao seu salão.</p>
          </div>
          <div className="dining-tables-batch-fields">
            <label>
              Prefixo
              <input
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                maxLength={40}
              />
            </label>
            <label>
              Primeiro número
              <input
                type="number"
                min={1}
                max={9999}
                value={start}
                onChange={(event) => setStart(Number(event.target.value))}
              />
            </label>
            <label>
              Quantidade
              <input
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={isPending}>
                  <Plus aria-hidden="true" /> Criar {count} mesas
                </Button>
              }
              title={`Criar ${count} mesas?`}
              description={`Serão criadas ${prefix} ${String(start).padStart(2, '0')} até ${prefix} ${String(start + count - 1).padStart(2, '0')}. Revise a sequência antes de confirmar.`}
              confirmLabel={`Criar ${count} mesas`}
              pendingLabel="Criando mesas…"
              onConfirm={createBatch}
            />
          </div>
        </section>
      ) : null}

      <header className="dining-tables-list-header">
        <div>
          <h2>Mesas cadastradas</h2>
          <p>
            {tables.length} no total · {printableTables.length} ativas
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!printableTables.length}
          onClick={() => print('ALL')}
        >
          <Printer aria-hidden="true" /> Imprimir todos
        </Button>
      </header>

      {tables.length === 0 ? (
        <div className="dining-tables-empty">
          <p>Nenhuma mesa cadastrada.</p>
          <span>Crie a primeira sequência acima.</span>
        </div>
      ) : (
        <ul className="dining-tables-list">
          {tables.map((table) => {
            const url = `${siteOrigin}/q/${encodeURIComponent(table.publicToken)}`;
            const svg = qrSvg(url);
            return (
              <li
                key={table.id}
                data-table-id={table.id}
                data-active={table.isActive}
                data-print-selected={printTarget === 'ALL' || printTarget === table.id}
              >
                <div className="dining-table-row">
                  <div className="dining-table-identity">
                    <strong>{table.label}</strong>
                    <span>{table.isActive ? 'QR ativo' : 'Desativada'}</span>
                  </div>
                  <div className="dining-table-actions">
                    <details>
                      <summary>
                        <Eye aria-hidden="true" /> Ver QR
                      </summary>
                      <div className="dining-table-qr-panel">
                        <div
                          className="dining-table-qr"
                          dangerouslySetInnerHTML={{ __html: svg }}
                        />
                        <p>{url}</p>
                        <div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              downloadBlob(svg, 'image/svg+xml', `${safeFilename(table.label)}.svg`)
                            }
                          >
                            <Download aria-hidden="true" /> SVG
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void downloadPng(svg, `${safeFilename(table.label)}.png`)
                            }
                          >
                            <Download aria-hidden="true" /> PNG
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => print(table.id)}
                          >
                            <Printer aria-hidden="true" /> Cartão A6
                          </Button>
                        </div>
                      </div>
                    </details>
                    {canManage ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(table.id);
                            setEditingLabel(table.label);
                          }}
                        >
                          <Pencil aria-hidden="true" /> Renomear
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button type="button" variant="ghost" size="sm">
                              <ToggleLeft aria-hidden="true" />{' '}
                              {table.isActive ? 'Desativar' : 'Reativar'}
                            </Button>
                          }
                          title={`${table.isActive ? 'Desativar' : 'Reativar'} ${table.label}?`}
                          description={
                            table.isActive
                              ? 'O QR deixará de aceitar novos pedidos. Pedidos existentes continuam intactos.'
                              : 'O QR atual voltará a aceitar novos pedidos.'
                          }
                          confirmLabel={table.isActive ? 'Desativar mesa' : 'Reativar mesa'}
                          onConfirm={() => toggle(table)}
                        />
                        <ConfirmDialog
                          trigger={
                            <Button type="button" variant="ghost" size="sm">
                              <RefreshCw aria-hidden="true" /> Rotacionar QR
                            </Button>
                          }
                          title={`Rotacionar o QR de ${table.label}?`}
                          description="O QR impresso anteriormente deixará de funcionar imediatamente. Será necessário imprimir o novo cartão."
                          confirmLabel="Rotacionar QR"
                          onConfirm={() => rotate(table)}
                          destructive
                        />
                      </>
                    ) : null}
                  </div>
                </div>
                {editingId === table.id ? (
                  <form
                    className="dining-table-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      rename(table);
                    }}
                  >
                    <label htmlFor={`rename-${table.id}`}>Novo nome</label>
                    <input
                      id={`rename-${table.id}`}
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={isPending}>
                      Salvar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancelar
                    </Button>
                  </form>
                ) : null}
                {rotationReceipt?.tableId === table.id ? (
                  <div className="dining-table-rotation-receipt" role="status">
                    <div>
                      <strong>Novo QR ativo</strong>
                      <span>
                        Rotacionado às{' '}
                        {rotationReceipt.at.toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        . O anterior foi invalidado.
                      </span>
                    </div>
                    <Button type="button" size="sm" onClick={() => print(table.id)}>
                      <Printer aria-hidden="true" /> Imprimir e substituir cartão
                    </Button>
                  </div>
                ) : null}
                <article className="dining-table-print-card" aria-hidden="true">
                  <p>{storeName}</p>
                  <h3>{table.label}</h3>
                  <div dangerouslySetInnerHTML={{ __html: svg }} />
                  <strong>Escaneie para pedir</strong>
                  <span>Cardápio, pedido e acompanhamento no seu celular.</span>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
