import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductForm } from '@/features/catalog/components/product-form';
import { getProductAction, listCategoriesAction } from '@/features/catalog/actions';

export const metadata = { title: 'Editar Produto' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getProductAction(id),
    listCategoriesAction(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <PageHeader title="Editar Produto" backHref="/dashboard/catalog" />
      <Card>
        <CardHeader>
          <CardTitle>{product.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm categories={categories} product={product} />
        </CardContent>
      </Card>
    </div>
  );
}
