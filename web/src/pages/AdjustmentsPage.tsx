import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea, STATUS_TONE } from '../components/ui';
import { formatDate } from '../lib/format';
import { WRITE_OFF_REASONS, ADJUSTMENT_REASONS } from '../lib/constants';

export function AdjustmentsPage() {
  const { t } = useTranslation();
  const { can, user } = useAuth();
  const toast = useToast();
  const canRequest = can(P.ADJUSTMENT_REQUEST, P.ADJUSTMENT_APPROVE);
  const canApprove = can(P.ADJUSTMENT_APPROVE);

  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<any[]>('/adjustments', { status: status || undefined });
  const [busy, setBusy] = useState('');

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await api.post(`/adjustments/${id}/${action}`);
      refetch();
      toast('success', t('common.updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('adjustments.title')}
        subtitle={t('adjustments.subtitle')}
        actions={canRequest ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('adjustments.create')}</button> : null}
      />

      <Card className="mb-4 p-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-64">
          <option value="">{t('common.all')} — {t('common.status')}</option>
          {['pending', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{t(`enum.adjustmentStatus.${s}`)}</option>)}
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
                <th className="th">{t('adjustments.number')}</th>
                <th className="th">{t('common.type')}</th>
                <th className="th">{t('common.sku')}</th>
                <th className="th">{t('common.location')}</th>
                <th className="th text-right">{t('common.quantity')}</th>
                <th className="th">{t('adjustments.reasonCode')}</th>
                <th className="th">{t('adjustments.requestedBy')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.actions')}</th>
              </tr>
            }
          >
            {data.map((a) => (
              <tr key={a.id}>
                <td className="td font-medium text-gray-900">{a.adjustment_number}</td>
                <td className="td"><Badge tone={a.type === 'write_off' ? 'red' : a.type === 'increase' ? 'green' : 'amber'}>{t(`enum.adjustmentType.${a.type}`)}</Badge></td>
                <td className="td">{a.sku_code}<div className="text-xs text-gray-400">{a.product_name}</div></td>
                <td className="td">{a.location_name}</td>
                <td className="td text-right">{a.quantity}</td>
                <td className="td text-xs text-gray-500">{String(t(`enum.reason.${a.reason_code}`, { defaultValue: a.reason_code }))}</td>
                <td className="td text-xs text-gray-500">{a.requested_by_name}</td>
                <td className="td"><Badge tone={STATUS_TONE[a.status]}>{t(`enum.adjustmentStatus.${a.status}`)}</Badge></td>
                <td className="td">
                  {a.status === 'pending' && canApprove && a.requested_by !== user?.id ? (
                    <div className="flex gap-1">
                      <button className="btn-primary text-xs py-1" disabled={busy === a.id} onClick={() => resolve(a.id, 'approve')}>{t('common.approve')}</button>
                      <button className="btn-secondary text-xs py-1" disabled={busy === a.id} onClick={() => resolve(a.id, 'reject')}>{t('common.reject')}</button>
                    </div>
                  ) : a.status === 'pending' ? (
                    <span className="text-xs text-amber-600">{t('adjustments.pending')}</span>
                  ) : (
                    <span className="text-xs text-gray-400">{a.approved_by_name ?? '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreateAdjustmentModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch(); toast('success', t('common.added')); }} />
      )}
    </div>
  );
}

function CreateAdjustmentModal({ onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: variants } = useFetch<any[]>('/variants');
  const { data: locations } = useFetch<any[]>('/locations');
  const [form, setForm] = useState<any>({ type: 'decrease', variant_id: '', location_id: '', quantity: 1, reason_code: 'data_entry_error', notes: '' });
  const [busy, setBusy] = useState(false);

  const reasons = form.type === 'write_off' ? WRITE_OFF_REASONS : ADJUSTMENT_REASONS;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/adjustments', {
        type: form.type,
        variant_id: form.variant_id,
        location_id: form.location_id,
        quantity: Number(form.quantity),
        reason_code: form.reason_code,
        notes: form.notes || undefined,
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('adjustments.create')}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('adjustments.mandatoryReason')}</div>
        <Field label={t('common.type')}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, reason_code: (e.target.value === 'write_off' ? WRITE_OFF_REASONS : ADJUSTMENT_REASONS)[0] })}>
            {['increase', 'decrease', 'write_off'].map((ty) => <option key={ty} value={ty}>{t(`enum.adjustmentType.${ty}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.sku')}>
          <Select value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} required>
            <option value="">—</option>
            {variants?.map((v) => <option key={v.id} value={v.id}>{v.sku_code} — {v.product_name}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.location')}>
            <Select value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })} required>
              <option value="">—</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label={t('common.quantity')}>
            <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
        </div>
        <Field label={t('adjustments.reasonCode')}>
          <Select value={form.reason_code} onChange={(e) => setForm({ ...form, reason_code: e.target.value })}>
            {reasons.map((r) => <option key={r} value={r}>{t(`enum.reason.${r}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.notes')}>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.submit')}</button>
        </div>
      </form>
    </Modal>
  );
}
