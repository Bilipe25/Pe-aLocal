'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer relative inline-flex h-11 w-14 shrink-0 cursor-pointer items-center rounded-full border-0 bg-transparent transition-colors before:absolute before:inset-x-1 before:inset-y-2 before:rounded-full before:bg-border before:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:before:bg-surface-secondary data-[state=checked]:before:bg-brand-600',
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none relative z-10 block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-8 data-[state=unchecked]:translate-x-2',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
