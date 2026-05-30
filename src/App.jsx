import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { SuperAdminProvider, useSuperAdmin } from './admin/contexts/SuperAdminContext';
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import PhonesPage from './pages/PhonesPage';
import SalesPage from './pages/SalesPage';
import CreditsPage from './pages/CreditsPage';
import ExpensesPage from './pages/ExpensesPage';
import ContactsPage from './pages/ContactsPage';
import ReportsPage from './pages/ReportsPage';
import DocumentsPage from './pages/DocumentsPage';
import SettingsPage from './pages/SettingsPage';
import ReturnsPage from './pages/ReturnsPage';

// Super Admin imports
import AdminLayout from './admin/components/AdminLayout';
import AdminLoginPage from './admin/pages/AdminLoginPage';
import AdminDashboard from './admin/pages/AdminDashboard';
import AdminShopsPage from './admin/pages/AdminShopsPage';
import AdminUsersPage from './admin/pages/AdminUsersPage';
import AdminRolesPage from './admin/pages/AdminRolesPage';
import AdminAuditPage from './admin/pages/AdminAuditPage';
import AdminSubscriptionsPage from './admin/pages/AdminSubscriptionsPage';
import AdminNotificationsPage from './admin/pages/AdminNotificationsPage';
import AdminBackupsPage from './admin/pages/AdminBackupsPage';
import AdminSystemSettings from './admin/pages/AdminSystemSettings';
import AdminTrashPage from './admin/pages/AdminTrashPage';

// ── Shop route guards ──────────────────────────────────────────────
const ProtectedRoute = ({ children, requiredRole }) => {
  const { currentUser, hasRole } = useAuth();
  const { subscription, isMaintenance, loading } = useSettings();

  if (!currentUser) return <Navigate to="/login" replace />;
  
  if (loading) return null; // Or a loading spinner

  // Check Maintenance Mode
  if (isMaintenance) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4 text-center">
        <div className="card max-w-md p-8">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🛠️</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Texnik ishlar</h1>
          <p className="text-dark-400">
            Tizimda profilaktika ishlari olib borilmoqda. Iltimos, birozdan so'ng qayta urinib ko'ring.
          </p>
        </div>
      </div>
    );
  }

  // Check Subscription (except for login page or specific roles if needed)
  if (!subscription.active) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-4 text-center">
        <div className="card max-w-md p-8">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">💳</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Obuna tugagan</h1>
          <p className="text-dark-400 mb-6">{subscription.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-primary w-full"
          >
            Yangilash
          </button>
        </div>
      </div>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) return <Navigate to="/" replace />;
  return children;
};

// ── Super Admin route guard ────────────────────────────────────────
const SuperAdminRoute = ({ children }) => {
  const { currentUser } = useSuperAdmin();
  if (!currentUser) return <Navigate to="/superadmin/login" replace />;
  return children;
};

// ── Shop routes ────────────────────────────────────────────────────
const ShopRoutes = () => {
  const { currentUser } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="phones" element={<PhonesPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="credits" element={<CreditsPage />} />
        <Route path="expenses" element={<ProtectedRoute requiredRole="manager"><ExpensesPage /></ProtectedRoute>} />
        <Route path="contacts" element={<ProtectedRoute requiredRole="manager"><ContactsPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute requiredRole="manager"><ReportsPage /></ProtectedRoute>} />
        <Route path="documents" element={<ProtectedRoute requiredRole="manager"><DocumentsPage /></ProtectedRoute>} />
        <Route path="returns" element={<ProtectedRoute requiredRole="manager"><ReturnsPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute requiredRole="manager"><SettingsPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// ── Super Admin routes ─────────────────────────────────────────────
const AdminRoutes = () => {
  const { currentUser } = useSuperAdmin();
  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/superadmin" replace /> : <AdminLoginPage />} />
      <Route path="/" element={<SuperAdminRoute><AdminLayout /></SuperAdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="shops" element={<AdminShopsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="roles" element={<AdminRolesPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="backups" element={<AdminBackupsPage />} />
        <Route path="trash" element={<AdminTrashPage />} />
        <Route path="settings" element={<AdminSystemSettings />} />
      </Route>
      <Route path="*" element={<Navigate to="/superadmin" replace />} />
    </Routes>
  );
};

// ── Root router ────────────────────────────────────────────────────
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Super Admin panel — /superadmin/* */}
        <Route
          path="/superadmin/*"
          element={
            <SuperAdminProvider>
              <AdminRoutes />
            </SuperAdminProvider>
          }
        />
        {/* Regular shop panel — /* */}
        <Route
          path="/*"
          element={
            <ThemeProvider>
              <AuthProvider>
                <SettingsProvider>
                  <ShopRoutes />
                </SettingsProvider>
              </AuthProvider>
            </ThemeProvider>
          }
        />
      </Routes>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
    </BrowserRouter>
  );
}

export default App;
