import type { ImgHTMLAttributes } from 'react';

// Only replaces Next's image loader, unavailable outside Next. Matches its fill geometry.
export default function TestImage({
  fill,
  priority: _priority,
  fetchPriority,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) {
  void _priority;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- browser fixture for the real ProductImage component
    <img
      {...props}
      alt={props.alt ?? ''}
      fetchPriority={fetchPriority}
      style={
        fill
          ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
          : props.style
      }
    />
  );
}
