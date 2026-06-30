import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { P } from '../lib/permissions';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, STATUS_TONE } from '../components/ui';
import { formatNumber, formatIDR, formatDate, downloadCsv } from '../lib/format';

export function StockLevelsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canSeeCost = can(P.FINANCIAL_VIEW);
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');

  const { data: locations } = useFetch<any[]>('/locations');
  const { data, loading } = useFetch<any[]>('/stock-levels', {
    location_id: location || undefined,
    search: search || undefined,
  });

  return (
    <div>
      <PageHeader
        title={t('stock.title')}
        subtitle={t('stock.subtitle')}
        actions={
          data && data.length > 0 ? (
            <button className="btn-secondary" onClick={() => downloadCsv('stock-levels.csv', data)}>
              {t('common.export')}
            </button>
          ) : null
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">{t('common.all')} — {t('common.location')}</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card>
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('common.sku')}</th>
                <th className="th">{t('common.location')}</th>
                <th className="th text-right">{t('common.onHand')}</th>
                <th className="th text-right">{t('common.reserved')}</th>
                <th className="th text-right">{t('common.available')}</th>
                {canSeeCost && <th className="th text-right">{t('common.value')}</th>}
                <th className="th">{t('stock.stockStatus')}</th>
                <th className="th">{t('stock.lastUpdated')}</th>
              </tr>
            }
          >
            {data.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <div className="font-medium text-gray-900">{r.sku_code}</div>
                  <div className="text-xs text-gray-400">{r.product_name}</div>
                </td>
                <td className="td">{r.location_name}</td>
                <td className="td text-right font-medium">{formatNumber(r.quantity_on_hand)}</td>
                <td className="td text-right text-gray-500">{formatNumber(r.quantity_reserved)}</td>
                <td className="td text-right font-semibold">{formatNumber(r.quantity_available)}</td>
                {canSeeCost && (
                  <td className="td text-right text-gray-600">{formatIDR(r.quantity_on_hand * r.cost_price)}</td>
                )}
                <td className="td">
                  <Badge tone={STATUS_TONE[r.stock_status]}>{t(`enum.stockStatus.${r.stock_status}`)}</Badge>
                </td>
                <td className="td text-xs text-gray-400">{formatDate(r.last_updated_at, true)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
