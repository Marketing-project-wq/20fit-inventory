import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Modal, Field, Input, Select } from '../components/ui';
import { LOCATION_TYPES } from '../lib/constants';

export function LocationsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(P.LOCATION_MANAGE);
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<any[]>('/locations');

  return (
    <div>
      <PageHeader
        title={t('locations.title')}
        subtitle={t('locations.subtitle')}
        actions={canManage ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('locations.create')}</button> : null}
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
                <th className="th">{t('common.name')}</th>
                <th className="th">{t('common.type')}</th>
                <th className="th">{t('locations.address')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((l) => (
              <tr key={l.id}>
                <td className="td font-medium text-gray-900">{l.name}</td>
                <td className="td"><Badge tone="blue">{t(`enum.locationType.${l.type}`)}</Badge></td>
                <td className="td text-gray-500">{l.address ?? '—'}</td>
                <td className="td"><Badge tone={l.is_active ? 'green' : 'gray'}>{l.is_active ? t('common.active') : t('common.inactive')}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && <CreateLocation onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch(); toast('success', t('common.added')); }} />}
    </div>
  );
}

function CreateLocation({ onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', type: 'warehouse', address: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/locations', { name: form.name, type: form.type, address: form.address || undefined });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('locations.create')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label={t('common.type')}>
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {LOCATION_TYPES.map((ty) => <option key={ty} value={ty}>{t(`enum.locationType.${ty}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('locations.address')}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
