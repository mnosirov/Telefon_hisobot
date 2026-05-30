import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import { Bell } from 'lucide-react';

const AdminLayout = () => {
  const { currentUser } = useSuperAdmin();
  const [collapsed, setCollapsed] = useState(false);

  if (!currentUser) return <Navigate to="/superadmin/login" replace />;

  return (
    <div className="min-h-screen bg-slate-950">
      <AdminSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className={`transition-all duration-300 min-h-screen flex flex-col ${collapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-sm border-b border-purple-900/30 px-6 h-14 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-400">Super Admin Panel</h2>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Tizim faol" />
            <span className="text-xs text-slate-500">Tizim faol</span>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
