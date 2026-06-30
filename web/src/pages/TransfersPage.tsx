import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Select, Input, Modal, Field, Textarea, STATUS_TONE } from '../components/ui';
import { formatDate } from '../lib/format';

export function TransfersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canTransfer = can(P.TRANSFER);

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, loading, refetch } = useFetch<any[]>('/transfers');

  return (
    <div>
      <PageHeader
        title={t('transfers.title')}
        subtitle={t('transfers.subtitle')}
        actions={canTransfer ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('transfers.create')}</button> : null}
      />

      <div className="mb-3 rounded-lg bg-blue-50 px-4 py-2.5 text-xs text-blue-800">{t('transfers.inTransitNote')}</div>

      <Card>
        {loading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('transfers.number')}</th>
                <th className="th">{t('transfers.source')}</th>
                <th className="th">{t('transfers.destination')}</th>
                <th className="th text-right">{t('transfers.lineCount')}</th>
                <th className="th">{t('common.createdAt')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((tr) => (
              <tr key={tr.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(tr.id)}>
                <td className="td font-medium text-gray-900">{tr.transfer_number}</td>
                <td className="td">{tr.source_name}</td>
                <td className="td">{tr.destination_name}</td>
                <td className="td text-right">{tr.line_count}</td>
                <td className="td text-xs text-gray-500">{formatDate(tr.created_at)}</td>
                <td className="td"><Badge tone={STATUS_TONE[tr.status]}>{t(`enum.transferStatus.${tr.status}`)}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && (
        <CreateTransferModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch(); toast('success', t('common.added')); }} />
      )}
      {detailId && (
        <TransferDetail id={detailId} canTransfer={canTransfer} onClose={() => setDetailId(null)} onChanged={refetch} />
      )}
    </div>
  );
}

function CreateTransferModal({ onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: locations } = useFetch<any[]>('/locations');
  const { data: variants } = useFetch<any[]>('/variants');
  const [form, setForm] = useState({ source_location_id: '', destination_location_id: '', notes: '' });
  const [lines, setLines] = useState<any[]>([{ variant_id: '', quantity: 1 }]);
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, patch: any) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/transfers', {
        source_location_id: form.source_location_id,
        destination_location_id: form.destination_location_id,
        notes: form.notes || undefined,
        lines: lines.filter((l) => l.variant_id).map((l) => ({ variant_id: l.variant_id, quantity: Number(l.quantity) })),
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('transfers.create')} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('transfers.source')}>
            <Select value={form.source_location_id} onChange={(e) => setForm({ ...form, source_location_id: e.target.value })} required>
              <option value="">—</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label={t('transfers.destination')}>
            <Select value={form.destination_location_id} onChange={(e) => setForm({ ...form, destination_location_id: e.target.value })} required>
              <option value="">—</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">{t('po.lines')}</span>
            <button type="button" className="btn-secondary text-xs" onClick={() => setLines([...lines, { variant_id: '', quantity: 1 }])}>+ {t('po.addLine')}</button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-12 gap-2">
              <div className="col-span-9">
                <Select value={l.variant_id} onChange={(e) => setLine(i, { variant_id: e.target.value })}>
                  <option value="">{t('po.selectVariant')}</option>
                  {variants?.map((v) => <option key={v.id} value={v.id}>{v.sku_code} — {v.product_name}</option>)}
                </Select>
              </div>
              <div className="col-span-3">
                <Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </div>
            </div>
          ))}
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

function TransferDetail({ id, canTransfer, onClose, onChanged }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data, loading, refetch } = useFetch<any>(`/transfers/${id}`);
  const [busy, setBusy] = useState(false);

  const act = async (action: string) => {
    setBusy(true);
    try {
      await api.post(`/transfers/${id}/${action}`);
      refetch();
      onChanged();
      toast('success', t('common.updated'));
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={data?.transfer_number ?? t('common.loading')} size="lg">
      {loading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div><span className="text-gray-400">{t('transfers.source')}: </span>{data.source_name}</div>
            <div>→</div>
            <div><span className="text-gray-400">{t('transfers.destination')}: </span>{data.destination_name}</div>
            <Badge tone={STATUS_TONE[data.status]}>{t(`enum.transferStatus.${data.status}`)}</Badge>
          </div>
          <Table head={<tr><th className="th">{t('common.sku')}</th><th className="th">{t('common.product')}</th><th className="th text-right">{t('common.quantity')}</th></tr>}>
            {data.lines.map((l: any) => (
              <tr key={l.id}>
                <td className="td font-medium">{l.sku_code}</td>
                <td className="td">{l.product_name}</td>
                <td className="td text-right">{l.quantity}</td>
              </tr>
            ))}
          </Table>
          {canTransfer && (
            <div className="flex justify-end gap-2 pt-2">
              {data.status === 'draft' && <button className="btn-danger" disabled={busy} onClick={() => act('cancel')}>{t('transfers.cancel')}</button>}
              {data.status === 'draft' && <button className="btn-primary" disabled={busy} onClick={() => act('dispatch')}>{t('transfers.dispatch')}</button>}
              {data.status === 'in_transit' && <button className="btn-primary" disabled={busy} onClick={() => act('receive')}>{t('transfers.receive')}</button>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
