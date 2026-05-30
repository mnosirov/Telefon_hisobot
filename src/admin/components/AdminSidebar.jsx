import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Store, Users, ShieldCheck, BarChart3,
  ScrollText, CreditCard, Bell, Database, Settings, LogOut,
  ChevronLeft, ChevronRight, Trash2
} from 'lucide-react';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import { useState } from 'react';

const navGroups = [
  {
    label: 'Asosiy',
    items: [
      { to: '/superadmin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ],
  },
  {
    label: 'Boshqaruv',
    items: [
      { to: '/superadmin/shops', label: 'Do\'konlar', icon: Store },
      { to: '/superadmin/users', label: 'Foydalanuvchilar', icon: Users },
      { to: '/superadmin/roles', label: 'Rollar & Ruxsatlar', icon: ShieldCheck },
    ],
  },
  {
    label: 'Moliya',
    items: [
      { to: '/superadmin/subscriptions', label: 'Obunalar', icon: CreditCard },
      { to: '/superadmin/reports', label: 'Hisobotlar', icon: BarChart3 },
    ],
  },
  {
    label: 'Tizim',
    items: [
      { to: '/superadmin/audit', label: 'Audit Log', icon: ScrollText },
      { to: '/superadmin/notifications', label: 'Bildirishnomalar', icon: Bell },
      { to: '/superadmin/backups', label: 'Zaxira nusxalar', icon: Database },
      { to: '/superadmin/trash', label: 'Savatcha', icon: Trash2 },
      { to: '/superadmin/settings', label: 'Sozlamalar', icon: Settings },
    ],
  },
];

const AdminSidebar = ({ collapsed, setCollapsed }) => {
  const { superAdminProfile, logout } = useSuperAdmin();

  return (
    <aside className={`fixed left-0 top-0 h-full bg-slate-900 border-r border-purple-900/30 flex flex-col z-40 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo */}
      <div className={`flex items-center gap-3 p-4 border-b border-purple-900/30 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold text-white">Super Admin</h1>
            <p className="text-xs text-purple-400">Boshqaruv paneli</p>
          </div>
        )}
      </div>

      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 w-6 h-6 bg-slate-800 border border-purple-900/50 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-700 transition-colors z-50"
      >
        {collapsed ? <ChevronRight className="w-3 h-3 text-purple-400" /> : <ChevronLeft className="w-3 h-3 text-purple-400" />}
      </button>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/30'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-purple-900/30 space-y-1">
        {!collapsed && (
          <div className="px-3 py-2 rounded-lg bg-purple-950/50">
            <p className="text-xs font-medium text-white truncate">{superAdminProfile?.displayName || 'Super Admin'}</p>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-600 text-white mt-0.5">
              SUPERADMIN
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && 'Chiqish'}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
