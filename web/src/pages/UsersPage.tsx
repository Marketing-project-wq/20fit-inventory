import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetch } from '../hooks/useFetch';
import { api, apiError } from '../api/client';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Table, Badge, EmptyState, LoadingState, Modal, Field, Input, Select } from '../components/ui';
import { formatDate } from '../lib/format';

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: users, loading, refetch } = useFetch<any[]>('/users');
  const { data: roles } = useFetch<any[]>('/roles');
  const { data: locations } = useFetch<any[]>('/locations');

  const roleName = (key: string) => {
    const r = roles?.find((x) => x.key === key);
    if (!r) return key;
    return i18n.language.startsWith('id') ? r.name_id : r.name_en;
  };

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={<button className="btn-primary" onClick={() => setCreating(true)}>+ {t('users.create')}</button>}
      />
      <Card>
        {loading ? (
          <LoadingState />
        ) : !users || users.length === 0 ? (
          <EmptyState message={t('common.noData')} />
        ) : (
          <Table
            head={
              <tr>
                <th className="th">{t('common.name')}</th>
                <th className="th">{t('suppliers.email')}</th>
                <th className="th">{t('users.role')}</th>
                <th className="th">{t('users.lastLogin')}</th>
                <th className="th">{t('common.status')}</th>
                <th className="th">{t('common.actions')}</th>
              </tr>
            }
          >
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium text-gray-900">{u.name}</td>
                <td className="td text-gray-500">{u.email}</td>
                <td className="td"><Badge tone="indigo">{roleName(u.role_key)}</Badge></td>
                <td className="td text-xs text-gray-500">{u.last_login_at ? formatDate(u.last_login_at, true) : t('users.never')}</td>
                <td className="td"><Badge tone={u.is_active ? 'green' : 'gray'}>{u.is_active ? t('common.active') : t('common.inactive')}</Badge></td>
                <td className="td"><button className="btn-secondary text-xs py-1" onClick={() => setEditing(u)}>{t('common.edit')}</button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {(creating || editing) && (
        <UserForm
          user={editing}
          roles={roles ?? []}
          locations={locations ?? []}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); refetch(); toast('success', t('common.updated')); }}
        />
      )}
    </div>
  );
}

function UserForm({ user, roles, locations, onClose, onSaved }: any) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const isEdit = !!user;
  const [form, setForm] = useState<any>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role_id: roles.find((r: any) => r.key === user?.role_key)?.id ?? roles[0]?.id ?? '',
    assigned_locations: user?.assigned_locations ?? [],
    is_active: user?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);

  const toggleLocation = (id: string) => {
    setForm((f: any) => ({
      ...f,
      assigned_locations: f.assigned_locations.includes(id)
        ? f.assigned_locations.filter((x: string) => x !== id)
        : [...f.assigned_locations, id],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isEdit) {
        await api.patch(`/users/${user.id}`, {
          name: form.name,
          role_id: form.role_id,
          assigned_locations: form.assigned_locations,
          is_active: form.is_active,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.post('/users', {
          name: form.name,
          email: form.email,
          password: form.password,
          role_id: form.role_id,
          assigned_locations: form.assigned_locations,
          is_active: form.is_active,
        });
      }
      onSaved();
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? t('common.edit') : t('users.create')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label={t('suppliers.email')}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={isEdit} />
        </Field>
        <Field label={isEdit ? t('users.newPassword') : t('users.password')} hint={isEdit ? t('common.optional') : undefined}>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!isEdit} minLength={8} />
        </Field>
        <Field label={t('users.role')}>
          <Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
            {roles.map((r: any) => (
              <option key={r.id} value={r.id}>{i18n.language.startsWith('id') ? r.name_id : r.name_en}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('users.assignedLocations')} hint={t('users.allLocations')}>
          <div className="flex flex-wrap gap-2">
            {locations.map((l: any) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLocation(l.id)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  form.assigned_locations.includes(l.id) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          {t('common.active')}
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
