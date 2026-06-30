import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea, STATUS_TONE } from '../components/ui';
import { formatDate, formatIDR, formatNumber } from '../lib/format';

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(P.PO_MANAGE);
  const canReceive = can(P.STOCK_IN);

  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, loading, refetch } = useFetch<any[]>('/purchase-orders', { status: status || undefined });

  return (
    <div>
      <PageHeader
        title={t('po.title')}
        subtitle={t('po.subtitle')}
        actions={canManage ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('po.create')}</button> : null}
      />

      <Card className="mb-4 p-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-64">
          <option value="">{t('common.all')} — {t('common.status')}</option>
          {['draft', 'submitted', 'partially_received', 'received', 'cancelled'].map((s) => (
            <option key={s} value={s}>{t(`enum.poStatus.${s}`)}</option>
          ))}
        </Select>
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
                <th className="th">{t('po.number')}</th>
                <th className="th">{t('common.supplier')}</th>
                <th className="th">{t('common.location')}</th>
                <th className="th">{t('po.expectedDate')}</th>
                <th className="th text-right">{t('po.lineCount')}</th>
                <th className="th text-right">{t('po.totalValue')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((po) => (
              <tr key={po.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(po.id)}>
                <td className="td font-medium text-gray-900">{po.po_number}</td>
                <td className="td">{po.supplier_name}</td>
                <td className="td">{po.location_name}</td>
                <td className="td">{formatDate(po.expected_date)}</td>
                <td className="td text-right">{po.line_count}</td>
                <td className="td text-right">{formatIDR(po.total_value)}</td>
                <td className="td"><Badge tone={STATUS_TONE[po.status]}>{t(`enum.poStatus.${po.status}`)}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreatePOModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch(); toast('success', t('common.added')); }}
        />
      )}
      {detailId && (
        <PODetail
          id={detailId}
          canManage={canManage}
          canReceive={canReceive}
          onClose={() => setDetailId(null)}
          onChanged={() => { refetch(); }}
        />
      )}
    </div>
  );
}

function CreatePOModal({ onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: suppliers } = useFetch<any[]>('/suppliers');
  const { data: locations } = useFetch<any[]>('/locations');
  const { data: variants } = useFetch<any[]>('/variants');
  const [form, setForm] = useState<any>({ supplier_id: '', location_id: '', expected_date: '', notes: '' });
  const [lines, setLines] = useState<any[]>([{ variant_id: '', quantity_ordered: 1, unit_cost: 0 }]);
  const [busy, setBusy] = useState(false);

  const addLine = () => setLines([...lines, { variant_id: '', quantity_ordered: 1, unit_cost: 0 }]);
  const setLine = (i: number, patch: any) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/purchase-orders', {
        supplier_id: form.supplier_id,
        location_id: form.location_id,
        expected_date: form.expected_date || undefined,
        notes: form.notes || undefined,
        lines: lines.filter((l) => l.variant_id).map((l) => ({
          variant_id: l.variant_id,
          quantity_ordered: Number(l.quantity_ordered),
          unit_cost: Number(l.unit_cost),
        })),
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('po.create')} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.supplier')}>
            <Select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} required>
              <option value="">—</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label={t('po.receivingLocation')}>
            <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required>
              <option value="">—</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label={t('po.expectedDate')}>
            <Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">{t('po.lines')}</span>
            <button type="button" className="btn-secondary text-xs" onClick={addLine}>+ {t('po.addLine')}</button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <Select value={l.variant_id} onChange={(e) => setLine(i, { variant_id: e.target.value })}>
                    <option value="">{t('po.selectVariant')}</option>
                    {variants?.map((v) => <option key={v.id} value={v.id}>{v.sku_code} — {v.product_name}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input type="number" min={1} value={l.quantity_ordered} onChange={(e) => setLine(i, { quantity_ordered: e.target.value })} placeholder={t('po.ordered')} />
                </div>
                <div className="col-span-3">
                  <Input type="number" min={0} value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} placeholder={t('po.unitCost')} />
                </div>
                <div className="col-span-1 text-right">
                  {lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-500">×</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label={t('common.notes')}>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.create')}</button>
        </div>
      </form>
    </Modal>
  );
}

function PODetail({ id, canManage, canReceive, onClose, onChanged }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, refetch } = useFetch<any>(`/purchase-orders/${id}`);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const changeStatus = async (status: string) => {
    setBusy(true);
    try {
      await api.patch(`/purchase-orders/${id}/status`, { status });
      refetch();
      onChanged();
      toast('success', t('common.updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const receive = async () => {
    const lines = Object.entries(receiveQty)
      .filter(([, q]) => q > 0)
      .map(([po_line_id, quantity]) => ({ po_line_id, quantity: Number(quantity) }));
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post(`/purchase-orders/${id}/receive`, { lines });
      if (res.data.variance_flags?.length) toast('info', t('po.varianceWarning'));
      setReceiveQty({});
      refetch();
      onChanged();
      toast('success', t('common.updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const canReceiveNow = data && !['received', 'cancelled', 'draft'].includes(data.status);

  return (
    <Modal open onClose={onClose} title={data?.po_number ?? t('common.loading')} size="lg">
      {loading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div><span className="text-gray-400">{t('common.supplier')}: </span>{data.supplier_name}</div>
            <div><span className="text-gray-400">{t('common.location')}: </span>{data.location_name}</div>
            <div><span className="text-gray-400">{t('po.expectedDate')}: </span>{formatDate(data.expected_date)}</div>
            <Badge tone={STATUS_TONE[data.status]}>{t(`enum.poStatus.${data.status}`)}</Badge>
          </div>

          <Table
            head={
              <tr>
                <th className="th">{t('common.sku')}</th>
                <th className="th text-right">{t('po.ordered')}</th>
                <th className="th text-right">{t('po.received')}</th>
                <th className="th text-right">{t('po.unitCost')}</th>
                {canReceiveNow && canReceive && <th className="th text-right">{t('po.receiveNow')}</th>}
              </tr>
            }
          >
            {data.lines.map((l: any) => {
              const remaining = l.quantity_ordered - l.quantity_received;
              return (
                <tr key={l.id}>
                  <td className="td">
                    <div className="font-medium">{l.sku_code}</div>
                    <div className="text-xs text-gray-400">{l.product_name}</div>
                  </td>
                  <td className="td text-right">{l.quantity_ordered}</td>
                  <td className="td text-right">{l.quantity_received}</td>
                  <td className="td text-right">{formatIDR(l.unit_cost)}</td>
                  {canReceiveNow && canReceive && (
                    <td className="td text-right">
                      <Input
                        type="number"
                        min={0}
                        className="w-20 text-right"
                        value={receiveQty[l.id] ?? ''}
                        placeholder={remaining > 0 ? String(remaining) : '0'}
                        onChange={(e) => setReceiveQty({ ...receiveQty, [l.id]: Number(e.target.value) })}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </Table>

          {canReceiveNow && canReceive && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('po.partialHint')}</div>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {canManage && data.status === 'draft' && (
              <button className="btn-secondary" disabled={busy} onClick={() => changeStatus('submitted')}>{t('po.markSubmitted')}</button>
            )}
            {canManage && ['draft', 'submitted'].includes(data.status) && (
              <button className="btn-danger" disabled={busy} onClick={() => changeStatus('cancelled')}>{t('po.cancelPo')}</button>
            )}
            {canReceiveNow && canReceive && (
              <button className="btn-primary" disabled={busy} onClick={receive}>{t('po.receiveGoods')}</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
