'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';

interface FormSubmitButtonProps extends ButtonProps {
  pendingLabel?: string;
}

export function FormSubmitButton({
  children,
  pendingLabel = 'Salvando…',
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
