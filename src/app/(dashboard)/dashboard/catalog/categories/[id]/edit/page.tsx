import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryForm } from '@/features/catalog/components/category-form';
import { getCategoryAction } from '@/features/catalog/actions';

export const metadata = { title: 'Editar Categoria' };

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await getCategoryAction(id);

  if (!category) {
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
