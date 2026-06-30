import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea, STATUS_TONE } from '../components/ui';
import { formatDate, localizedName } from '../lib/format';

export function OpnamePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(P.OPNAME_MANAGE);

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, loading, refetch } = useFetch<any[]>('/opnames');

  return (
    <div>
      <PageHeader
        title={t('opname.title')}
        subtitle={t('opname.subtitle')}
        actions={canManage ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('opname.create')}</button> : null}
      />

      <Card>
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('opname.number')}</th>
                <th className="th">{t('common.location')}</th>
                <th className="th text-right">{t('opname.countSheet')}</th>
                <th className="th">{t('common.createdAt')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(o.id)}>
                <td className="td font-medium text-gray-900">{o.opname_number}</td>
                <td className="td">{o.location_name}</td>
                <td className="td text-right">{o.line_count}</td>
                <td className="td text-xs text-gray-500">{formatDate(o.created_at)}</td>
                <td className="td"><Badge tone={STATUS_TONE[o.status]}>{t(`enum.opnameStatus.${o.status}`)}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreateOpnameModal onClose={() => setShowCreate(false)} onSaved={(id: string) => { setShowCreate(false); refetch(); setDetailId(id); }} />
      )}
      {detailId && <OpnameDetail id={detailId} onClose={() => setDetailId(null)} onChanged={refetch} />}
    </div>
  );
}

function CreateOpnameModal({ onClose, onSaved }: any) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { data: locations } = useFetch<any[]>('/locations');
  const { data: categories } = useFetch<any[]>('/categories');
  const [form, setForm] = useState({ location_id: '', category_id: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/opnames', {
        location_id: form.location_id,
        category_id: form.category_id || null,
        notes: form.notes || undefined,
      });
      onSaved(res.data.id);
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('opname.create')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.location')}>
          <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required>
            <option value="">—</option>
            {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label={`${t('opname.scope')} (${t('common.optional')})`} hint={t('opname.byCategory')}>
          <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">{t('opname.fullCount')}</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{localizedName(c, i18n.language)}</option>)}
          </Select>
        </Field>
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

function OpnameDetail({ id, onClose, onChanged }: any) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, refetch } = useFetch<any>(`/opnames/${id}`);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      const init: Record<string, string> = {};
      for (const l of data.lines) if (l.counted_qty != null) init[l.id] = String(l.counted_qty);
      setCounts(init);
    }
  }, [data]);

  const isCounting = data?.status === 'counting';
  const canApprove = can(P.OPNAME_APPROVE);

  const saveCounts = async () => {
    const payload = Object.entries(counts)
      .filter(([, v]) => v !== '')
      .map(([line_id, v]) => ({ line_id, counted_qty: Number(v) }));
    if (payload.length === 0) return;
    setBusy(true);
    try {
      await api.patch(`/opnames/${id}/count`, { counts: payload });
      refetch();
      toast('success', t('common.updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: string) => {
    setBusy(true);
    try {
      const res = await api.post(`/opnames/${id}/${action}`);
      if (action === 'approve') toast('success', t('opname.adjustmentsPosted', { count: res.data.adjustments_posted ?? 0 }));
      else toast('success', t('common.updated'));
      refetch();
      onChanged();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={data?.opname_number ?? t('common.loading')} size="xl">
      {loading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div><span className="text-gray-400">{t('common.location')}: </span>{data.location_name}</div>
            <Badge tone={STATUS_TONE[data.status]}>{t(`enum.opnameStatus.${data.status}`)}</Badge>
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            <Table
              head={
                <tr>
                  <th className="th">{t('common.sku')}</th>
                  <th className="th text-right">{t('opname.expectedQty')}</th>
                  <th className="th text-right">{t('opname.countedQty')}</th>
                  <th className="th text-right">{t('opname.variance')}</th>
                </tr>
              }
            >
              {data.lines.map((l: any) => {
                const counted = counts[l.id] ?? '';
                const variance = counted === '' ? null : Number(counted) - l.expected_qty;
                return (
                  <tr key={l.id}>
                    <td className="td">{l.sku_code}<div className="text-xs text-gray-400">{l.product_name}</div></td>
                    <td className="td text-right">{l.expected_qty}</td>
                    <td className="td text-right">
                      {isCounting ? (
                        <Input type="number" min={0} className="w-24 text-right" value={counted} onChange={(e) => setCounts({ ...counts, [l.id]: e.target.value })} />
                      ) : (
                        l.counted_qty ?? <span className="text-xs text-gray-400">{t('opname.notCounted')}</span>
                      )}
                    </td>
                    <td className={`td text-right font-medium ${variance == null ? 'text-gray-300' : variance === 0 ? 'text-gray-500' : variance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance == null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {isCounting && (
              <>
                <button className="btn-secondary" disabled={busy} onClick={saveCounts}>{t('opname.enterCounts')}</button>
                <button className="btn-secondary" disabled={busy} onClick={() => act('cancel')}>{t('transfers.cancel')}</button>
                <button className="btn-primary" disabled={busy} onClick={() => act('submit')}>{t('opname.submitForApproval')}</button>
              </>
            )}
            {data.status === 'pending_approval' && canApprove && (
              <button className="btn-primary" disabled={busy} onClick={() => act('approve')}>{t('opname.approve')}</button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
