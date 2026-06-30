import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { api, apiError } from '../api/client';
import { useToast } from '../components/Toast';
import { PageHeader, Card, Field, Input } from '../components/ui';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);

  const roleName = user ? (i18n.language.startsWith('id') ? user.role.name_id : user.role.name_en) : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/change-password', form);
      toast('success', t('users.passwordChanged'));
      setForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast('error', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title={t('users.myAccount')} />
      <Card className="p-6 mb-6">
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-400">{t('common.name')}: </span><span className="font-medium">{user?.name}</span></div>
          <div><span className="text-gray-400">{t('suppliers.email')}: </span>{user?.email}</div>
          <div><span className="text-gray-400">{t('users.role')}: </span>{roleName}</div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 font-semibold text-gray-800">{t('users.changePassword')}</h3>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('users.currentPassword')}>
            <Input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          </Field>
          <Field label={t('users.newPassword')}>
            <Input type="password" minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          </Field>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
        </form>
      </Card>
    </div>
  );
}
