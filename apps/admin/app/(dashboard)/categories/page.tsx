'use client';

import { CrudTable } from '@/components/crud-table';
import { Badge } from '@/components/ui/badge';

export default function CategoriesPage() {
  return (
    <CrudTable
      title="Categories"
      description="Browse categories shown in the desktop app"
      endpoint="/admin/categories"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'slug', label: 'Slug' },
        { key: 'description', label: 'Description' },
        {
          key: 'gameCount',
          label: 'Games',
          render: (row) => <Badge variant="secondary">{String(row.gameCount)}</Badge>,
        },
      ]}
      fields={[
        { name: 'name', label: 'Name' },
        { name: 'slug', label: 'Slug' },
        { name: 'description', label: 'Description', type: 'textarea' },
      ]}
    />
  );
}
