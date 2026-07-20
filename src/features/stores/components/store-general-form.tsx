'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateStoreAction } from '@/features/stores/actions';
import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { useState } from 'react';

interface StoreGeneralFormProps {
  storeId: string;
  store: {
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
}

export function StoreGeneralForm({ storeId, store }: StoreGeneralFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await updateStoreAction(storeId, formData);
    if (result.success) {
      toast.success('Loja atualizada com sucesso!');
      router.refresh();
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormMessage message={error} />
      <div className="space-y-2">
        <Label htmlFor="name">Nome da loja</Label>
        <Input id="name" name="name" defaultValue={store.name} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Endereço da loja</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-text-secondary shrink-0 text-sm">pedidolocal.com.br/</span>
          <Input id="slug" name="slug" defaultValue={store.slug} required className="flex-1" />
        </div>
        <p className="text-text-secondary text-sm">
          Este é o link público do seu cardápio. Use letras minúsculas, números e hífens.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={store.description ?? ''}
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={store.phone ?? ''}
            placeholder="(11) 99999-9999"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input
            id="whatsapp"
            name="whatsapp"
            type="tel"
            inputMode="tel"
            defaultValue={store.whatsapp ?? ''}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <FormSubmitButton>Salvar alterações</FormSubmitButton>
      </div>
    </form>
  );
}
