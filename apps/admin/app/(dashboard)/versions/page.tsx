'use client';

import { CrudTable, type Column } from '@/components/crud-table';
import { Badge } from '@/components/ui/badge';

const columns: Column[] = [
  { key: 'version', label: 'Version' },
  { key: 'channel', label: 'Channel', render: (r) => <Badge variant={r.channel === 'stable' ? 'success' : 'secondary'}>{String(r.channel)}</Badge> },
  { key: 'releasedAt', label: 'Released', render: (r) => new Date(String(r.releasedAt)).toLocaleDateString() },
  { key: 'isLatest', label: 'Latest', render: (r) => (r.isLatest ? <Badge>Latest</Badge> : '—') },
  { key: 'releaseNotes', label: 'Notes', render: (r) => <span className="line-clamp-1 text-muted-foreground">{String(r.releaseNotes ?? '')}</span> },
];

export default function AppVersionsPage() {
  return (
    <CrudTable
      title="App Versions"
      description="Desktop releases — drives the in-app “update available” prompt"
      endpoint="/admin/app-versions"
      columns={columns}
      fields={[
        { name: 'version', label: 'Version (semver)' },
        { name: 'channel', label: 'Channel (stable/beta)' },
        { name: 'downloadUrl', label: 'Download URL' },
        { name: 'checksumSha256', label: 'SHA-256 checksum' },
        { name: 'minAppVersion', label: 'Min app version' },
        { name: 'releaseNotes', label: 'Release notes', type: 'textarea' },
      ]}
    />
  );
}
