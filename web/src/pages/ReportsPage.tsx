import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { P } from '../lib/permissions';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Input } from '../components/ui';
import { formatIDR, formatNumber, formatDate, downloadCsv } from '../lib/format';

type Col = { key: string; label: string; fmt?: 'idr' | 'number' | 'date' | 'overdue'; align?: 'right' };

interface TabDef {
  key: string;
  perm: string[];
  endpoint: string;
  cols: Col[];
  days?: boolean;
  valuation?: boolean;
}

const TABS: TabDef[] = [
  {
    key: 'stockOnHand', perm: [P.REPORTS_VIEW, P.STOCK_VIEW], endpoint: '/reports/stock-on-hand',
    cols: [
      { key: 'sku_code', label: 'common.sku' }, { key: 'product_name', label: 'common.product' },
      { key: 'brand_name', label: 'common.brand' }, { key: 'location_name', label: 'common.location' },
      { key: 'quantity_on_hand', label: 'common.onHand', align: 'right', fmt: 'number' },
      { key: 'quantity_available', label: 'common.available', align: 'right', fmt: 'number' },
    ],
  },
  {
    key: 'valuation', perm: [P.FINANCIAL_VIEW], endpoint: '/reports/valuation', valuation: true,
    cols: [
      { key: 'sku_code', label: 'common.sku' }, { key: 'product_name', label: 'common.product' },
      { key: 'location_name', label: 'common.location' },
      { key: 'quantity_on_hand', label: 'common.onHand', align: 'right', fmt: 'number' },
      { key: 'cost_price', label: 'common.costPrice', align: 'right', fmt: 'idr' },
      { key: 'total_value', label: 'common.value', align: 'right', fmt: 'idr' },
    ],
  },
  {
    key: 'lowStock', perm: [P.REPORTS_VIEW, P.STOCK_VIEW], endpoint: '/reports/low-stock',
    cols: [
      { key: 'sku_code', label: 'common.sku' }, { key: 'product_name', label: 'common.product' },
      { key: 'location_name', label: 'common.location' },
      { key: 'quantity_on_hand', label: 'common.onHand', align: 'right', fmt: 'number' },
      { key: 'reorder_point', label: 'reports.suggestedQty', align: 'right', fmt: 'number' },
      { key: 'reorder_quantity', label: 'products.reorderQty', align: 'right', fmt: 'number' },
    ],
  },
  {
    key: 'movers', perm: [P.REPORTS_VIEW], endpoint: '/reports/movers', days: true,
    cols: [
      { key: 'sku_code', label: 'common.sku' }, { key: 'product_name', label: 'common.product' },
      { key: 'brand_name', label: 'common.brand' },
      { key: 'units_sold', label: 'reports.unitsSold', align: 'right', fmt: 'number' },
      { key: 'sale_count', label: 'reports.saleCount', align: 'right', fmt: 'number' },
    ],
  },
  {
    key: 'deadStock', perm: [P.REPORTS_VIEW], endpoint: '/reports/dead-stock', days: true,
    cols: [
      { key: 'sku_code', label: 'common.sku' }, { key: 'product_name', label: 'common.product' },
      { key: 'total_on_hand', label: 'common.onHand', align: 'right', fmt: 'number' },
      { key: 'last_movement_at', label: 'reports.lastMovement', fmt: 'date' },
    ],
  },
  {
    key: 'poStatus', perm: [P.REPORTS_VIEW], endpoint: '/reports/po-status',
    cols: [
      { key: 'po_number', label: 'po.number' }, { key: 'supplier_name', label: 'common.supplier' },
      { key: 'total_ordered', label: 'reports.totalOrdered', align: 'right', fmt: 'number' },
      { key: 'total_received', label: 'reports.totalReceived', align: 'right', fmt: 'number' },
      { key: 'expected_date', label: 'po.expectedDate', fmt: 'overdue' },
    ],
  },
  {
    key: 'writeOffs', perm: [P.REPORTS_VIEW], endpoint: '/reports/write-offs',
    cols: [
      { key: 'performed_at', label: 'common.date', fmt: 'date' }, { key: 'sku_code', label: 'common.sku' },
      { key: 'location_name', label: 'common.location' },
      { key: 'quantity', label: 'common.quantity', align: 'right', fmt: 'number' },
      { key: 'reason_code', label: 'common.reason' },
      { key: 'loss_value', label: 'reports.lossValue', align: 'right', fmt: 'idr' },
    ],
  },
];

export function ReportsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const tabs = TABS.filter((tab) => can(...tab.perm));
  const [active, setActive] = useState(tabs[0]?.key ?? 'stockOnHand');
  const [days, setDays] = useState(90);

  const tab = tabs.find((x) => x.key === active) ?? tabs[0];
  const { data, loading } = useFetch<any>(tab?.endpoint ?? null, tab?.days ? { days } : undefined);
  const rows: any[] = tab?.valuation ? data?.rows ?? [] : Array.isArray(data) ? data : [];

  const fmtCell = (col: Col, value: any) => {
    if (col.fmt === 'idr') return formatIDR(value);
    if (col.fmt === 'number') return formatNumber(value);
    if (col.fmt === 'date') return formatDate(value);
    if (col.key === 'reason_code') return String(t(`enum.reason.${value}`, { defaultValue: value ?? '—' }));
    if (col.fmt === 'overdue')
      return (
        <span>
          {formatDate(value)}
        </span>
      );
    return value ?? '—';
  };

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          rows.length > 0 ? (
            <button className="btn-secondary" onClick={() => downloadCsv(`${active}.csv`, rows)}>{t('common.export')}</button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setActive(x.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active === x.key ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t(`reports.${x.key}`)}
          </button>
        ))}
      </div>

      {tab?.days && (
        <Card className="mb-4 p-4 flex items-center gap-3">
          <span className="text-sm text-gray-500">{t('reports.period')}</span>
          <Input type="number" min={1} className="w-28" value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
        </Card>
      )}

      <Card>
        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <>
            <Table
              head={
                <tr>
                  {tab!.cols.map((c) => (
                    <th key={c.key} className={`th ${c.align === 'right' ? 'text-right' : ''}`}>{t(c.label)}</th>
                  ))}
                </tr>
              }
            >
              {rows.map((r, i) => (
                <tr key={i}>
                  {tab!.cols.map((c) => (
                    <td key={c.key} className={`td ${c.align === 'right' ? 'text-right' : ''}`}>
                      {c.fmt === 'overdue' && r.overdue ? (
                        <span>{formatDate(r[c.key])} <Badge tone="red">{t('dashboard.overdue')}</Badge></span>
                      ) : (
                        fmtCell(c, r[c.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
            {tab?.valuation && (
              <div className="border-t border-gray-200 px-4 py-3 text-right text-sm font-semibold">
                {t('reports.grandTotal')}: <span className="text-brand-700">{formatIDR(data?.grand_total)}</span>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
