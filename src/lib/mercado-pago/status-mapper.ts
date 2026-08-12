export type MercadoPagoMappedState =
  'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED' | 'REVIEW';

export function mapMercadoPagoOrderStatus(
  status: string,
  statusDetail: string,
): MercadoPagoMappedState {
  const pair = `${status.toLowerCase()}/${statusDetail.toLowerCase()}`;
  switch (pair) {
    case 'created/created':
    case 'processing/in_process':
    case 'action_required/waiting_payment':
    case 'action_required/waiting_transfer':
      return 'PENDING';
    case 'processed/accredited':
      return 'PAID';
    case 'failed/failed':
      return 'FAILED';
    case 'expired/expired':
      return 'EXPIRED';
    case 'canceled/canceled':
      return 'CANCELLED';
    case 'refunded/refunded':
      return 'REFUNDED';
    default:
      return 'REVIEW';
  }
}
