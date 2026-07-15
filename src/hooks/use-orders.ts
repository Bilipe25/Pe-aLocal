'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrdersAction, type GetOrdersParams } from '@/features/orders/admin-actions';
import { usePusherChannel } from '@/hooks/use-pusher-channel';

export function useOrders(storeId: string | null, params?: GetOrdersParams) {
  const queryClient = useQueryClient();

  // Query principal
  const query = useQuery({
    queryKey: ['orders', storeId, params],
    queryFn: async () => {
      const result = await getOrdersAction(params);
      if (!result.success) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!storeId,
  });

  // Escutar eventos do Pusher
  const channelName = storeId ? `store-${storeId}` : null;

  usePusherChannel<{ orderId: string; orderNumber: number }>(channelName, 'new-order', () => {
    // Quando chega um pedido novo, invalidamos a query para forçar o fetch
    queryClient.invalidateQueries({ queryKey: ['orders', storeId] });

    // Opcional: tocar um som
    try {
      const audio = new Audio('/notification.mp3'); // Se existir
      audio.play().catch(() => {});
    } catch {
      // A notificação sonora é opcional e pode não estar disponível no navegador.
    }
  });

  usePusherChannel(channelName, 'order-updated', () => {
    queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
  });

  usePusherChannel(channelName, 'payment-updated', () => {
    queryClient.invalidateQueries({ queryKey: ['orders', storeId] });
  });

  return query;
}
