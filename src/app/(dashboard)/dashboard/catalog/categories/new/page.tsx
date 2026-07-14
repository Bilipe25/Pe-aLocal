import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryForm } from '@/features/catalog/components/category-form';

export const metadata = { title: 'Nova Categoria' };

export default function NewCategoryPage() {
  return (
    <div>
      <PageHeader title="Nova Categoria" backHref="/dashboard/catalog" />
      <Card>
        <CardHeader>
          <CardTitle>Dados da Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm />
        </CardContent>
      </Card>
    </div>
  );
}
