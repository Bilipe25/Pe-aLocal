'use client';

import { ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frameId: number | null = null;

    function updateVisibility() {
      frameId = null;
      setVisible(window.scrollY > 400);
    }

    function handleScroll() {
      if (frameId === null) {
        frameId = window.requestAnimationFrame(updateVisibility);
      }
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  function scrollToTop() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      className={`storefront-scroll-top ${visible ? 'is-visible' : ''}`}
      onClick={scrollToTop}
      aria-label="Voltar ao topo"
    >
      <ChevronUp aria-hidden="true" />
    </button>
  );
}
