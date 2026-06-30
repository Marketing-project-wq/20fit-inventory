import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import {
  PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea, MOVEMENT_TONE,
} from '../components/ui';
import { MOVEMENT_TYPES } from '../lib/constants';
import { formatDate, formatNumber, downloadCsv } from '../lib/format';

type QuickAction = 'stock-in' | 'sale' | 'return' | null;

export function MovementsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const [filters, setFilters] = useState({ movement_type: '', location_id: '', from: '', to: '' });
  const [action, setAction] = useState<QuickAction>(null);

  const { data: locations } = useFetch<any[]>('/locations');
  const { data: variants } = useFetch<any[]>('/variants');
  const { data, loading, refetch } = useFetch<any[]>('/movements', {
    movement_type: filters.movement_type || undefined,
    location_id: filters.location_id || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  });

  const onDone = () => {
    setAction(null);
    refetch();
  };

  return (
    <div>
      <PageHeader
        title={t('movements.title')}
        subtitle={t('movements.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            {can(P.STOCK_IN) && (
              <button className="btn-secondary" onClick={() => setAction('stock-in')}>
                + {t('movements.quickStockIn')}
              </button>
            )}
            {can(P.STOCK_OUT_SALE) && (
              <button className="btn-secondary" onClick={() => setAction('sale')}>
                + {t('movements.quickSale')}
              </button>
            )}
            {can(P.RETURN) && (
              <button className="btn-secondary" onClick={() => setAction('return')}>
                + {t('movements.quickReturn')}
              </button>
            )}
            {data && data.length > 0 && (
              <button className="btn-secondary" onClick={() => downloadCsv('movements.csv', data)}>
                {t('common.export')}
              </button>
            )}
          </div>
        }
      />

      <div className="mb-3 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-800">{t('movements.ledgerNote')}</div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={filters.movement_type} onChange={(e) => setFilters({ ...filters, movement_type: e.target.value })}>
            <option value="">{t('common.all')} — {t('common.type')}</option>
            {MOVEMENT_TYPES.map((m) => (
              <option key={m} value={m}>
                {t(`enum.movementType.${m}`)}
              </option>
            ))}
          </Select>
          <Select value={filters.location_id} onChange={(e) => setFilters({ ...filters, location_id: e.target.value })}>
            <option value="">{t('common.all')} — {t('common.location')}</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
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
                <th className="th">{t('common.date')}</th>
                <th className="th">{t('common.type')}</th>
                <th className="th">{t('common.sku')}</th>
                <th className="th">{t('common.location')}</th>
                <th className="th text-right">{t('common.quantity')}</th>
                <th className="th">{t('common.reason')}</th>
                <th className="th">{t('movements.performedBy')}</th>
              </tr>
            }
          >
            {data.map((m) => (
              <tr key={m.id}>
                <td className="td text-xs text-gray-500">{formatDate(m.performed_at, true)}</td>
                <td className="td">
                  <Badge tone={MOVEMENT_TONE[m.movement_type]}>{t(`enum.movementType.${m.movement_type}`)}</Badge>
                </td>
                <td className="td">
                  <div className="font-medium text-gray-900">{m.sku_code}</div>
                  <div className="text-xs text-gray-400">{m.product_name}</div>
                </td>
                <td className="td">
                  {m.location_name}
                  {m.related_location_name && <span className="text-xs text-gray-400"> → {m.related_location_name}</span>}
                </td>
                <td className="td text-right font-medium">{formatNumber(m.quantity)}</td>
                <td className="td text-xs text-gray-500">{m.reason_code ? String(t(`enum.reason.${m.reason_code}`, { defaultValue: m.reason_code })) : '—'}</td>
                <td className="td text-xs text-gray-500">{m.performed_by_name}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {action && (
        <QuickActionModal
          action={action}
          variants={variants ?? []}
          locations={locations ?? []}
          onClose={() => setAction(null)}
          onDone={onDone}
          notify={toast}
        />
      )}
    </div>
  );

  function QuickActionModal({ action, variants, locations, onClose, onDone, notify }: any) {
    const [form, setForm] = useState<any>({
      variant_id: variants[0]?.id ?? '',
      location_id: locations.find((l: any) => l.type === 'warehouse')?.id ?? locations[0]?.id ?? '',
      quantity: 1,
      reason: 'found_stock',
      channel: 'b2c',
      condition: 'sellable',
      customer_name: '',
      notes: '',
      allow_backorder: false,
    });
    const [busy, setBusy] = useState(false);

    const titles: Record<string, string> = {
      'stock-in': t('movements.quickStockIn'),
      sale: t('movements.quickSale'),
      return: t('movements.quickReturn'),
    };

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      try {
        const body: any = {
          variant_id: form.variant_id,
          location_id: form.location_id,
          quantity: Number(form.quantity),
          notes: form.notes || undefined,
        };
        if (action === 'stock-in') {
          body.reason = form.reason;
          body.unit_cost = form.unit_cost ? Number(form.unit_cost) : undefined;
          await api.post('/movements/stock-in', body);
        } else if (action === 'sale') {
          body.channel = form.channel;
          body.customer_name = form.customer_name || undefined;
          body.allow_backorder = form.allow_backorder;
          await api.post('/movements/sale', body);
        } else {
          body.condition = form.condition;
          const res = await api.post('/movements/return', body);
          if (res.data.routed_to_quarantine) notify('info', t('movements.routedQuarantine'));
        }
        notify('success', t('common.added'));
        onDone();
      } catch (err) {
        notify('error', apiError(err));
      } finally {
        setBusy(false);
      }
    };

    return (
      <Modal open onClose={onClose} title={titles[action]}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('common.sku')}>
            <Select value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} required>
              {variants.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.sku_code} — {v.product_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.location')}>
            <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.quantity')}>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>

          {action === 'stock-in' && (
            <Field label={t('common.reason')}>
              <Select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {['found_stock', 'cycle_count_correction', 'data_entry_error', 'other'].map((r) => (
                  <option key={r} value={r}>
                    {t(`enum.reason.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {action === 'sale' && (
            <>
              <Field label={t('movements.channel')}>
                <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {['b2c', 'b2b', 'pos', 'manual'].map((c) => (
                    <option key={c} value={c}>
                      {t(`enum.channel.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('movements.customerName')}>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </Field>
              {can(P.PO_MANAGE, P.ADJUSTMENT_APPROVE) && (
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={form.allow_backorder} onChange={(e) => setForm({ ...form, allow_backorder: e.target.checked })} />
                  {t('movements.allowBackorder')}
                </label>
              )}
            </>
          )}

          {action === 'return' && (
            <Field label={t('movements.condition')}>
              <Select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                {['sellable', 'damaged', 'needs_inspection'].map((c) => (
                  <option key={c} value={c}>
                    {t(`enum.returnCondition.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label={t('common.notes')}>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.submit')}
            </button>
          </div>
        </form>
      </Modal>
    );
  }
}
