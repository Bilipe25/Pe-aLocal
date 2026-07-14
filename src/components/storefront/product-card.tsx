import { formatCurrency } from '@/lib/utils';
import { Star, Ban } from 'lucide-react';

interface ProductCardProps {
  name: string;
  description: string | null;
  basePrice: number;
  isFeatured: boolean;
  isSoldOut: boolean;
  imageUrl: string | null;
  onClick: () => void;
  disabled?: boolean;
}

export function ProductCard({
  name,
  description,
  basePrice,
  isFeatured,
  isSoldOut,
  onClick,
  disabled,
}: ProductCardProps) {
  const isDisabled = disabled || isSoldOut;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`flex w-full items-start gap-3 rounded-xl border border-tinta/10 bg-papel p-3 text-left shadow-sm transition-all ${
        isDisabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-tinta/20 hover:shadow-md active:scale-[0.98]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-body text-sm font-semibold text-tinta truncate">{name}</h3>
          {isFeatured && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-pimenta text-pimenta" />
          )}
          {isSoldOut && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-tinta/10 px-2 py-0.5 text-[10px] font-medium text-tinta/60">
              <Ban className="h-2.5 w-2.5" /> Esgotado
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-tinta/50 line-clamp-2">{description}</p>
        )}
        <p className="mt-1.5 font-mono text-sm font-bold text-pimenta">
          {formatCurrency(basePrice)}
        </p>
      </div>

      {/* Placeholder de imagem */}
      <div className="h-16 w-16 shrink-0 rounded-lg bg-kraft/50" />
    </button>
  );
}
