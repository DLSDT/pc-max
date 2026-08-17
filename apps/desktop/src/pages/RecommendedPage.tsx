import { useTranslation } from 'react-i18next';
import { MonitorCog } from 'lucide-react';
import { EmptyState } from '@/components/ui';

export default function RecommendedPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('recommended.title')}</h1>
      <EmptyState icon={<MonitorCog aria-hidden />} title={t('recommended.placeholder')} />
    </div>
  );
}
