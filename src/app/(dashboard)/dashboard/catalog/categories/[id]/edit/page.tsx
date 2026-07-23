import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryForm } from '@/features/catalog/components/category-form';
import { Permission } from '@/server/permissions';
import * as categoryRepo from '@/server/repositories/category.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

export const metadata = { title: 'Editar Categoria' };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
  const category = await categoryRepo.findCategoryById(id, session.tenantId);

  if (!category || category.storeId !== store.id) {
    notFound();
  }

  return (
    <div>
      <PageHeader title="Editar Categoria" backHref="/dashboard/catalog" />
      <Card>
        <CardHeader>
          <CardTitle>{category.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm category={category} />
        </CardContent>
      </Card>
    </div>
  );
}
