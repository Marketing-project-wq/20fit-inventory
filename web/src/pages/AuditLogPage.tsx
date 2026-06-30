import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState } from '../components/ui';
import { formatDate } from '../lib/format';

export function AuditLogPage() {
  const { t } = useTranslation();
  const { data, loading } = useFetch<any[]>('/audit-log');

  return (
    <div>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Card>
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('common.date')}</th>
                <th className="th">{t('audit.user')}</th>
                <th className="th">{t('audit.action')}</th>
                <th className="th">{t('audit.entity')}</th>
              </tr>
            }
          >
            {data.map((a) => (
              <tr key={a.id}>
                <td className="td text-xs text-gray-500">{formatDate(a.created_at, true)}</td>
                <td className="td">{a.user_name ?? '—'}</td>
                <td className="td"><Badge tone="gray">{a.action}</Badge></td>
                <td className="td text-xs text-gray-500">{a.entity_type}{a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}` : ''}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
