import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductForm } from '@/features/catalog/components/product-form';
import { listCategoriesAction } from '@/features/catalog/actions';

export const metadata = { title: 'Novo Produto' };

export default async function NewProductPage() {
  const categories = await listCategoriesAction();

  return (
    <div>
      <PageHeader title="Novo Produto" backHref="/dashboard/catalog" />
      <Card>
        <CardHeader>
          <CardTitle>Dados do Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
