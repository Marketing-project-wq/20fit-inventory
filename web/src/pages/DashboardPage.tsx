import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { PageHeader, StatCard, Card, Table, Badge, EmptyState, LoadingState } from '../components/ui';
import { formatIDR, formatNumber, formatDate } from '../lib/format';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data, loading } = useFetch<any>('/dashboard');

  if (loading) return <LoadingState />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard
          label={t('dashboard.totalValue')}
          value={data.total_inventory_value == null ? t('dashboard.noValueAccess') : formatIDR(data.total_inventory_value)}
          tone="brand"
        />
        <StatCard label={t('dashboard.skuCount')} value={formatNumber(data.sku_count)} />
        <StatCard
          label={t('dashboard.belowReorder')}
          value={formatNumber(data.below_reorder_count)}
          tone={data.below_reorder_count > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={t('dashboard.outOfStock')}
          value={formatNumber(data.out_of_stock_count)}
          tone={data.out_of_stock_count > 0 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low-stock watchlist */}
        <Card>
          <div className="border-b border-gray-100 px-5 py-3 font-semibold text-gray-800">
            {t('dashboard.lowStockWatchlist')}
          </div>
          {data.low_stock_watchlist.length === 0 ? (
            <EmptyState message={t('dashboard.allGood')} />
          ) : (
            <Table
              head={
                <tr>
                  <th className="th">{t('common.sku')}</th>
                  <th className="th">{t('common.location')}</th>
                  <th className="th text-right">{t('common.onHand')}</th>
                  <th className="th text-right">{t('dashboard.reorderPoint')}</th>
                </tr>
              }
            >
              {data.low_stock_watchlist.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="td">
                    <div className="font-medium text-gray-900">{r.sku_code}</div>
                    <div className="text-xs text-gray-400">{r.product_name}</div>
                  </td>
                  <td className="td">{r.location_name}</td>
                  <td className="td text-right font-semibold text-red-600">{r.quantity_on_hand}</td>
                  <td className="td text-right text-gray-500">{r.reorder_point}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Open POs */}
        <Card>
          <div className="border-b border-gray-100 px-5 py-3 font-semibold text-gray-800">{t('dashboard.openPOs')}</div>
          {data.open_purchase_orders.length === 0 ? (
            <EmptyState message={t('common.noData')} />
          ) : (
            <Table
              head={
                <tr>
                  <th className="th">{t('po.number')}</th>
                  <th className="th">{t('common.supplier')}</th>
                  <th className="th">{t('po.expectedDate')}</th>
                </tr>
              }
            >
              {data.open_purchase_orders.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="td font-medium text-gray-900">{r.po_number}</td>
                  <td className="td">{r.supplier_name}</td>
                  <td className="td">
                    {formatDate(r.expected_date)}{' '}
                    {r.overdue ? <Badge tone="red">{t('dashboard.overdue')}</Badge> : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Top movers */}
        <Card>
          <div className="border-b border-gray-100 px-5 py-3 font-semibold text-gray-800">{t('dashboard.topMovers')}</div>
          {data.top_movers.length === 0 ? (
            <EmptyState message={t('common.noData')} />
          ) : (
            <div className="p-4 space-y-2">
              {data.top_movers.map((r: any, i: number) => {
                const max = data.top_movers[0].units_sold || 1;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 truncate text-sm text-gray-700" title={r.product_name}>
                      {r.sku_code}
                    </div>
                    <div className="flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-4 rounded-full bg-brand-500"
                        style={{ width: `${Math.max(6, (r.units_sold / max) * 100)}%` }}
                      />
                    </div>
                    <div className="w-24 text-right text-xs text-gray-500">
                      {r.units_sold} {t('dashboard.unitsSold')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent adjustments */}
        <Card>
          <div className="border-b border-gray-100 px-5 py-3 font-semibold text-gray-800">
            {t('dashboard.recentAdjustments')}
          </div>
          {data.recent_adjustments.length === 0 ? (
            <EmptyState message={t('common.noData')} />
          ) : (
            <Table
              head={
                <tr>
                  <th className="th">{t('common.date')}</th>
                  <th className="th">{t('common.sku')}</th>
                  <th className="th">{t('common.type')}</th>
                  <th className="th text-right">{t('common.quantity')}</th>
                </tr>
              }
            >
              {data.recent_adjustments.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="td text-xs text-gray-500">{formatDate(r.performed_at)}</td>
                  <td className="td font-medium">{r.sku_code}</td>
                  <td className="td">
                    <Badge tone={r.movement_type === 'write_off' ? 'red' : 'amber'}>
                      {t(`enum.movementType.${r.movement_type}`)}
                    </Badge>
                  </td>
                  <td className="td text-right">{r.quantity}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
