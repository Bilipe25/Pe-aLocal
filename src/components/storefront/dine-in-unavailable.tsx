import { CircleOff, QrCode, Store } from 'lucide-react';

export function DineInUnavailable({
  state,
  storeName,
}: {
  state: 'INVALID' | 'INACTIVE' | 'DISABLED';
  storeName?: string;
}) {
  const content =
    state === 'INVALID'
      ? {
          icon: QrCode,
          title: 'Este QR Code não é mais válido',
          message: 'Peça à equipe um novo QR Code para fazer seu pedido.',
        }
      : state === 'INACTIVE'
        ? {
            icon: CircleOff,
            title: 'Esta mesa está indisponível',
            message: 'Peça ajuda à equipe para continuar seu pedido.',
          }
        : {
            icon: Store,
            title: 'Pedidos pelo salão estão pausados',
            message: 'A equipe pode anotar seu pedido diretamente na mesa.',
          };
  const Icon = content.icon;

  return (
    <main className="dine-in-unavailable">
      <Icon aria-hidden="true" />
      <h1>{content.title}</h1>
      <p>{content.message}</p>
      {storeName ? <small>{storeName}</small> : null}
    </main>
  );
}
