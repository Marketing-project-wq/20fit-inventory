import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { StockLevelsPage } from './pages/StockLevelsPage';
import { MovementsPage } from './pages/MovementsPage';
import { PurchaseOrdersPage } from './pages/PurchaseOrdersPage';
import { TransfersPage } from './pages/TransfersPage';
import { AdjustmentsPage } from './pages/AdjustmentsPage';
import { OpnamePage } from './pages/OpnamePage';
import { ReportsPage } from './pages/ReportsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { LocationsPage } from './pages/LocationsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AccountPage } from './pages/AccountPage';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return (
    <ToastProvider>
      <Layout>{children}</Layout>
    </ToastProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/products" element={<Protected><ProductsPage /></Protected>} />
      <Route path="/stock" element={<Protected><StockLevelsPage /></Protected>} />
      <Route path="/movements" element={<Protected><MovementsPage /></Protected>} />
      <Route path="/purchase-orders" element={<Protected><PurchaseOrdersPage /></Protected>} />
      <Route path="/transfers" element={<Protected><TransfersPage /></Protected>} />
      <Route path="/adjustments" element={<Protected><AdjustmentsPage /></Protected>} />
      <Route path="/opname" element={<Protected><OpnamePage /></Protected>} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/suppliers" element={<Protected><SuppliersPage /></Protected>} />
      <Route path="/locations" element={<Protected><LocationsPage /></Protected>} />
      <Route path="/users" element={<Protected><UsersPage /></Protected>} />
      <Route path="/audit" element={<Protected><AuditLogPage /></Protected>} />
      <Route path="/account" element={<Protected><AccountPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
