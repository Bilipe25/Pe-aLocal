'use client';

import { useEffect, useRef } from 'react';

interface CategoryNavProps {
  categories: { id: string; name: string }[];
  activeCategoryId: string | null;
  onCategoryClick: (id: string) => void;
}

export function CategoryNav({ categories, activeCategoryId, onCategoryClick }: CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const active = activeRef.current;
      const left = active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2;
      container.scrollTo({ left, behavior: 'smooth' });
    }
  }, [activeCategoryId]);

  return (
    <nav className="sticky top-0 z-10 border-b border-tinta/10 bg-papel/95 backdrop-blur-sm">
      <div
        ref={scrollRef}
        className="scrollbar-hide mx-auto flex max-w-2xl gap-1 overflow-x-auto px-4 py-2"
      >
        {categories.map((cat) => {
          const isActive = cat.id === activeCategoryId;
          return (
            <button
              key={cat.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => onCategoryClick(cat.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-pimenta text-white'
                  : 'text-tinta/60 hover:bg-tinta/5 hover:text-tinta'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
