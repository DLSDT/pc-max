'use client';

import { CrudTable } from '@/components/crud-table';

export default function TagsPage() {
  return (
    <CrudTable
      title="Tags"
      description="Free-form tags used to describe games"
      endpoint="/admin/tags"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'slug', label: 'Slug' },
      ]}
      fields={[
        { name: 'name', label: 'Name' },
        { name: 'slug', label: 'Slug' },
      ]}
    />
  );
}
