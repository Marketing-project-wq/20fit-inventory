import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { apiError } from '../api/client';
import { Input, Spinner } from '../components/ui';

const DEMO_ACCOUNTS = [
  { email: 'admin@20fit.id', role: 'System Administrator' },
  { email: 'ops@20fit.id', role: 'Operations Lead' },
  { email: 'purchasing@20fit.id', role: 'Purchasing Owner' },
  { email: 'warehouse@20fit.id', role: 'Warehouse Staff' },
  { email: 'shop@20fit.id', role: 'Shop / Sales Staff' },
  { email: 'finance@20fit.id', role: 'Finance' },
  { email: 'exec@20fit.id', role: 'Executive' },
];
const DEMO_PASSWORD = '20fit1234';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@20fit.id');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const lang = i18n.language.startsWith('id') ? 'id' : 'en';

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 to-brand-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 overflow-hidden rounded-2xl shadow-2xl">
        {/* Brand panel */}
        <div className="hidden md:flex flex-col justify-between bg-brand-700 p-8 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl font-bold text-brand-700">
              20
            </div>
            <div>
              <div className="font-semibold">20FIT Shop</div>
              <div className="text-xs text-brand-200">PT Kredo AUM</div>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-snug">{t('common.appName')}</h2>
            <p className="mt-2 text-sm text-brand-100">{t('login.subtitle')}</p>
          </div>
          <div className="flex gap-2 text-xs text-brand-200">
            <button
              onClick={() => i18n.changeLanguage('en')}
              className={lang === 'en' ? 'font-bold text-white' : ''}
            >
              English
            </button>
            <span>·</span>
            <button
              onClick={() => i18n.changeLanguage('id')}
              className={lang === 'id' ? 'font-bold text-white' : ''}
            >
              Bahasa Indonesia
            </button>
          </div>
        </div>

        {/* Form panel */}
        <div className="bg-white p-8">
          <h1 className="text-xl font-semibold text-gray-900">{t('login.title')}</h1>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label">{t('login.email')}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div>
              <label className="label">{t('login.password')}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? <Spinner className="h-4 w-4" /> : t('login.signIn')}
            </button>
          </form>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <div className="text-xs font-semibold text-gray-500">{t('login.demoTitle')}</div>
            <p className="text-[11px] text-gray-400 mb-2">{t('login.demoHint', { password: DEMO_PASSWORD })}</p>
            <div className="flex flex-wrap gap-1.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                  className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:border-brand-400 hover:bg-brand-50"
                  title={a.role}
                >
                  {a.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
