import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { P } from '../lib/permissions';

interface NavItem {
  to: string;
  labelKey: string;
  perms?: string[]; // any-of; undefined = always visible
}
interface NavGroup {
  labelKey?: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { items: [{ to: '/', labelKey: 'nav.dashboard' }] },
  {
    labelKey: 'nav.operations',
    items: [
      { to: '/products', labelKey: 'nav.products', perms: [P.STOCK_VIEW] },
      { to: '/stock', labelKey: 'nav.stock', perms: [P.STOCK_VIEW] },
      { to: '/movements', labelKey: 'nav.movements', perms: [P.STOCK_VIEW] },
      { to: '/transfers', labelKey: 'nav.transfers', perms: [P.STOCK_VIEW] },
      { to: '/adjustments', labelKey: 'nav.adjustments', perms: [P.STOCK_VIEW] },
      { to: '/opname', labelKey: 'nav.opname', perms: [P.STOCK_VIEW] },
    ],
  },
  {
    labelKey: 'nav.purchasing',
    items: [
      { to: '/purchase-orders', labelKey: 'nav.purchaseOrders', perms: [P.STOCK_VIEW] },
      { to: '/suppliers', labelKey: 'nav.suppliers', perms: [P.STOCK_VIEW] },
    ],
  },
  {
    labelKey: 'nav.analytics',
    items: [
      { to: '/reports', labelKey: 'nav.reports', perms: [P.REPORTS_VIEW, P.STOCK_VIEW] },
      { to: '/audit', labelKey: 'nav.auditLog', perms: [P.AUDIT_VIEW] },
    ],
  },
  {
    labelKey: 'nav.administration',
    items: [
      { to: '/locations', labelKey: 'nav.locations', perms: [P.STOCK_VIEW] },
      { to: '/users', labelKey: 'nav.users', perms: [P.USERS_MANAGE] },
    ],
  },
];

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('id') ? 'id' : 'en';
  return (
    <div className="flex items-center rounded-lg border border-gray-300 bg-white p-0.5 text-xs font-medium">
      {(['en', 'id'] as const).map((lng) => (
        <button
          key={lng}
          onClick={() => i18n.changeLanguage(lng)}
          className={`rounded-md px-2.5 py-1 transition ${
            current === lng ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const roleName = user
    ? i18n.language.startsWith('id')
      ? user.role.name_id
      : user.role.name_en
    : '';

  const visible = (item: NavItem) => !item.perms || can(...item.perms);

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside
        className={`${
          mobileOpen ? 'block' : 'hidden'
        } lg:block fixed lg:static inset-y-0 left-0 z-30 w-64 shrink-0 bg-brand-900 text-brand-50 overflow-y-auto`}
      >
        <div className="flex items-center gap-2 px-5 py-5 border-b border-brand-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-brand-700">
            20
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">20FIT Shop</div>
            <div className="text-[11px] text-brand-300">Inventory</div>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-5">
          {NAV.map((group, gi) => {
            const items = group.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={gi}>
                {group.labelKey && (
                  <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-400">
                    {t(group.labelKey)}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                          isActive ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-800'
                        }`
                      }
                    >
                      {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:px-8">
          <button className="lg:hidden text-gray-500" onClick={() => setMobileOpen((v) => !v)}>
            ☰
          </button>
          <div className="hidden sm:block text-sm text-gray-400">{t('common.appTagline')}</div>
          <div className="flex items-center gap-3 ml-auto">
            <LanguageSwitcher />
            <button
              onClick={() => navigate('/account')}
              className="text-right hover:opacity-80"
              title={t('users.myAccount')}
            >
              <div className="text-sm font-medium text-gray-800 leading-tight">{user?.name}</div>
              <div className="text-[11px] text-gray-500">{roleName}</div>
            </button>
            <button onClick={logout} className="btn-secondary text-xs">
              {t('common.signOut')}
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
