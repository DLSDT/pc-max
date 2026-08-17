'use client';

import { CrudTable } from '@/components/crud-table';

export default function OptimizationCategoriesPage() {
  return (
    <CrudTable
      title="Optimization Categories"
      description="Groups for optimization settings (Graphics, Performance, …)"
      endpoint="/admin/optimization-categories"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'slug', label: 'Slug' },
        { key: 'sortOrder', label: 'Order' },
      ]}
      fields={[
        { name: 'name', label: 'Name' },
        { name: 'slug', label: 'Slug' },
        { name: 'sortOrder', label: 'Order', type: 'number' },
      ]}
    />
  );
}
