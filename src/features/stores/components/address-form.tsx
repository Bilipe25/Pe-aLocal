'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateAddressAction } from '@/features/stores/actions';

interface AddressFormProps {
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  } | null;
}

export function AddressForm({ address }: AddressFormProps) {
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    const result = await updateAddressAction(formData);
    if (result.success) {
      toast.success('Endereço atualizado!');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="zipCode">CEP</Label>
        <Input id="zipCode" name="zipCode" defaultValue={address?.zipCode ?? ''} placeholder="00000-000" className="w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="street">Rua</Label>
          <Input id="street" name="street" defaultValue={address?.street ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="number">Número</Label>
          <Input id="number" name="number" defaultValue={address?.number ?? ''} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="complement">Complemento</Label>
        <Input id="complement" name="complement" defaultValue={address?.complement ?? ''} placeholder="Sala, bloco, etc." />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="neighborhood">Bairro</Label>
          <Input id="neighborhood" name="neighborhood" defaultValue={address?.neighborhood ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" name="city" defaultValue={address?.city ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">Estado</Label>
          <Input id="state" name="state" defaultValue={address?.state ?? ''} required maxLength={2} placeholder="SP" className="w-20" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Salvar endereço</Button>
      </div>
    </form>
  );
}
