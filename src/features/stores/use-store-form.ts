'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { StoreFormActionResult } from '@/features/stores/form-state';

export function useStoreForm(expectedConfigurationVersion: number) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const [configurationVersion, setConfigurationVersion] = useState(expectedConfigurationVersion);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isDirty, setIsDirty] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const followLink = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      if (window.confirm('Você possui alterações não salvas. Deseja sair sem salvar?')) {
        setDirty(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', followLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', followLink, true);
    };
  }, [setDirty]);

  function focusFirstInvalidField(errors: Record<string, string[]>) {
    const firstField = Object.keys(errors)[0];
    if (!firstField) return;
    requestAnimationFrame(() => {
      const escaped = CSS.escape(firstField);
      const target =
        formRef.current?.querySelector<HTMLElement>(`[name="${escaped}"]`) ??
        formRef.current?.querySelector<HTMLElement>(`#${escaped}`);
      target?.focus();
    });
  }

  function handleResult(result: StoreFormActionResult, successMessage: string) {
    if (result.success) {
      const nextVersion = result.configurationVersion ?? result.data.configurationVersion;
      setConfigurationVersion(nextVersion);
      setFormError(null);
      setFieldErrors({});
      setDirty(false);
      toast.success(result.message ?? successMessage);
      router.refresh();
      return true;
    }

    const nextFieldErrors = result.fieldErrors ?? {};
    setFormError(result.formError ?? result.error.message);
    setFieldErrors(nextFieldErrors);
    toast.error(result.formError ?? result.error.message);
    focusFirstInvalidField(nextFieldErrors);
    return false;
  }

  function restore() {
    formRef.current?.reset();
    setFormError(null);
    setFieldErrors({});
    setDirty(false);
  }

  return {
    formRef,
    configurationVersion,
    formError,
    fieldErrors,
    isDirty,
    markDirty: () => setDirty(true),
    handleResult,
    restore,
  };
}
