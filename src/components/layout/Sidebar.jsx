import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Smartphone, ShoppingCart, CreditCard,
  TrendingDown, Users, BarChart3, FileText, Settings, LogOut,
  Sun, Moon, ChevronLeft, ChevronRight, X, RotateCcw
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';

const navItems = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard, permission: null },
  { to: '/phones', label: 'Telefonlar', icon: Smartphone, permission: 'view_inventory' },
  { to: '/sales', label: 'Sotuv', icon: ShoppingCart, permission: 'create_sales' },
  { to: '/credits', label: 'Qarz', icon: CreditCard, permission: 'manage_credits' },
  { to: '/expenses', label: 'Chiqimlar', icon: TrendingDown, permission: 'view_expenses' },
  { to: '/contacts', label: 'Mijozlar', icon: Users, permission: 'manage_users' },
  { to: '/reports', label: 'Hisobotlar', icon: BarChart3, permission: 'export_reports' },
  { to: '/documents', label: 'Hujjatlar', icon: FileText, permission: 'export_reports' },
  { to: '/returns', label: 'Qaytarishlar', icon: RotateCcw, permission: 'export_reports' },
  { to: '/settings', label: 'Sozlamalar', icon: Settings, permission: 'access_settings' },
];

const Sidebar = ({ collapsed, setCollapsed, onClose }) => {
  const { userProfile, logout, hasPermission } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { appSettings } = useSettings();

  // onClose prop means we are in mobile drawer mode
  const isMobile = !!onClose;

  const allowedItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  return (
    <aside
      className={`
        fixed left-0 top-0 h-full bg-white dark:bg-dark-800 border-r border-dark-100 dark:border-dark-700
        flex flex-col z-40 transition-all duration-300 shadow-lg
        ${isMobile ? 'w-72' : (collapsed ? 'w-16' : 'w-64')}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-dark-100 dark:border-dark-700">
        <div className="flex items-center gap-3">
          {appSettings.logo ? (
            <img src={appSettings.logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="flex-shrink-0 w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
          )}
          {(!collapsed || isMobile) && (
            <div>
              <h1 className="text-sm font-bold text-dark-900 dark:text-white truncate max-w-[120px]">
                {appSettings.name}
              </h1>
              <p className="text-xs text-dark-400">Boshqaruv tizimi</p>
            </div>
          )}
        </div>
        {/* Mobile close (X) button */}
        {isMobile && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-400"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Desktop collapse toggle — hidden on mobile drawer */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-16 w-6 h-6 bg-white dark:bg-dark-700 border border-dark-200 dark:border-dark-600 rounded-full flex items-center justify-center shadow-sm hover:bg-dark-50 dark:hover:bg-dark-600 transition-colors z-50"
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-dark-500" />
            : <ChevronLeft className="w-3 h-3 text-dark-500" />}
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {allowedItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'
            }
            title={collapsed && !isMobile ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-2 border-t border-dark-100 dark:border-dark-700 space-y-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`sidebar-item-inactive w-full ${collapsed && !isMobile ? 'justify-center' : ''}`}
        >
          {isDark ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
          {(!collapsed || isMobile) && <span>{isDark ? 'Kunduzgi' : 'Tungi'} rejim</span>}
        </button>

        {/* User info */}
        {(!collapsed || isMobile) && (
          <div className="px-3 py-2 rounded-lg bg-dark-50 dark:bg-dark-700">
            <p className="text-xs font-medium text-dark-900 dark:text-white truncate">
              {userProfile?.displayName || userProfile?.email}
            </p>
            <p className="text-xs text-dark-400 capitalize">{userProfile?.role}</p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className={`sidebar-item-inactive w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 ${collapsed && !isMobile ? 'justify-center' : ''}`}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {(!collapsed || isMobile) && <span>Chiqish</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
