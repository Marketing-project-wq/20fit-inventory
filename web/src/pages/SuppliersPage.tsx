import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { P } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Modal, Field, Input } from '../components/ui';

export function SuppliersPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const canManage = can(P.SUPPLIER_MANAGE);
  const [showCreate, setShowCreate] = useState(false);
  const { data, loading, refetch } = useFetch<any[]>('/suppliers');

  return (
    <div>
      <PageHeader
        title={t('suppliers.title')}
        subtitle={t('suppliers.subtitle')}
        actions={canManage ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ {t('suppliers.create')}</button> : null}
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
                <th className="th">{t('suppliers.contactPerson')}</th>
                <th className="th">{t('suppliers.email')}</th>
                <th className="th text-right">{t('suppliers.leadTime')}</th>
                <th className="th">{t('suppliers.paymentTerms')}</th>
                <th className="th">{t('common.status')}</th>
              </tr>
            }
          >
            {data.map((s) => (
              <tr key={s.id}>
                <td className="td font-medium text-gray-900">{s.name}</td>
                <td className="td">{s.contact_info?.contact_person ?? '—'}</td>
                <td className="td text-gray-500">{s.contact_info?.email ?? '—'}</td>
                <td className="td text-right">{s.default_lead_time_days ?? '—'}</td>
                <td className="td">{s.payment_terms ?? '—'}</td>
                <td className="td"><Badge tone={s.is_active ? 'green' : 'gray'}>{s.is_active ? t('common.active') : t('common.inactive')}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {showCreate && <CreateSupplier onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch(); toast('success', t('common.added')); }} />}
    </div>
  );
}

function CreateSupplier({ onClose, onSaved }: any) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', contact_person: '', email: '', phone: '', default_lead_time_days: '', payment_terms: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/suppliers', {
        name: form.name,
        contact_info: { contact_person: form.contact_person, email: form.email, phone: form.phone },
        default_lead_time_days: form.default_lead_time_days ? Number(form.default_lead_time_days) : undefined,
        payment_terms: form.payment_terms || undefined,
      });
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('suppliers.create')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('suppliers.contactPerson')}><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
          <Field label={t('suppliers.email')}><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label={t('suppliers.phone')}><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('suppliers.leadTime')}><Input type="number" min={0} value={form.default_lead_time_days} onChange={(e) => setForm({ ...form, default_lead_time_days: e.target.value })} /></Field>
          <Field label={t('suppliers.paymentTerms')}><Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
