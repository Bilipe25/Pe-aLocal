'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateStoreAction } from '@/features/stores/actions';

interface StoreGeneralFormProps {
  store: {
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
}

export function StoreGeneralForm({ store }: StoreGeneralFormProps) {
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    const result = await updateStoreAction(formData);
    if (result.success) {
      toast.success('Loja atualizada com sucesso!');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome da loja</Label>
        <Input id="name" name="name" defaultValue={store.name} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Slug (URL)</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-tertiary">pedidolocal.com.br/</span>
          <Input id="slug" name="slug" defaultValue={store.slug} required className="flex-1" />
        </div>
        <p className="text-xs text-text-tertiary">Apenas letras minúsculas, números e hífens.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={store.description ?? ''} rows={3} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" name="phone" defaultValue={store.phone ?? ''} placeholder="(11) 99999-9999" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp</Label>
          <Input id="whatsapp" name="whatsapp" defaultValue={store.whatsapp ?? ''} placeholder="(11) 99999-9999" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Salvar alterações</Button>
      </div>
    </form>
  );
}
