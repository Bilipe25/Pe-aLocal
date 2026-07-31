'use client';

import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface OrderLaneLoadMoreButtonProps {
  laneTitle: string;
  loadedCount: number;
  totalCount: number;
  isLoading: boolean;
  disabled: boolean;
  onLoadMore: () => void;
}

export function OrderLaneLoadMoreButton({
  laneTitle,
  loadedCount,
  totalCount,
  isLoading,
  disabled,
  onLoadMore,
}: OrderLaneLoadMoreButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-brand-700 mt-2 w-full"
      disabled={disabled}
      aria-busy={isLoading}
      aria-label={
        isLoading ? `Carregando mais pedidos em ${laneTitle}` : `Mais pedidos em ${laneTitle}`
      }
      onClick={onLoadMore}
    >
      {isLoading ? 'Carregando…' : `Mais pedidos · ${loadedCount} de ${totalCount}`}
      {!isLoading && <ChevronDown className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}
