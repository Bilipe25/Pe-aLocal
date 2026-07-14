'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDeliveryZoneAction } from '@/features/delivery/actions';

export function DeliveryZoneForm() {
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    const result = await createDeliveryZoneAction(formData);
    if (result.success) {
      toast.success('Zona de entrega criada!');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 space-y-1">
        <Label htmlFor="dz-name" className="text-xs">Nome</Label>
        <Input id="dz-name" name="name" required placeholder="Ex: Centro (até 3km)" className="h-9" />
      </div>
      <div className="w-28 space-y-1">
        <Label htmlFor="dz-fee" className="text-xs">Taxa (R$)</Label>
        <Input id="dz-fee" name="fee" type="number" step="0.01" min="0" defaultValue="0" className="h-9" />
      </div>
      <div className="w-32 space-y-1">
        <Label htmlFor="dz-time" className="text-xs">Tempo estimado</Label>
        <Input id="dz-time" name="estimatedTime" placeholder="30-40 min" className="h-9" />
      </div>
      <input type="hidden" name="isActive" value="true" />
      <input type="hidden" name="sortOrder" value="0" />
      <Button type="submit" size="sm" className="h-9">Adicionar</Button>
    </form>
  );
}
