import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Smartphone, ShoppingCart, CreditCard,
  TrendingDown, Users, BarChart3, FileText, Settings,
  MoreHorizontal, X, Sun, Moon, LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const mainItems = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard, permission: null },
  { to: '/phones', label: 'Telefonlar', icon: Smartphone, permission: 'view_inventory' },
  { to: '/sales', label: 'Sotuv', icon: ShoppingCart, permission: 'create_sales' },
  { to: '/credits', label: 'Qarz', icon: CreditCard, permission: 'manage_credits' },
];

const moreItems = [
  { to: '/expenses', label: 'Chiqimlar', icon: TrendingDown, permission: 'view_expenses' },
  { to: '/contacts', label: 'Mijozlar', icon: Users, permission: 'manage_users' },
  { to: '/reports', label: 'Hisobotlar', icon: BarChart3, permission: 'export_reports' },
  { to: '/documents', label: 'Hujjatlar', icon: FileText, permission: 'export_reports' },
  { to: '/settings', label: 'Sozlamalar', icon: Settings, permission: 'access_settings' },
];

const BottomNav = () => {
  const { userProfile, logout, hasPermission } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = userProfile?.role || 'cashier';

  const allowedMain = mainItems.filter((i) => !i.permission || hasPermission(i.permission));
  const allowedMore = moreItems.filter((i) => !i.permission || hasPermission(i.permission));

  const isMoreActive = allowedMore.some((i) => location.pathname.startsWith(i.to));

  const handleMoreNav = (to) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      {/* More overlay */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end"
          onClick={() => setMoreOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Bottom sheet */}
          <div
            className="relative bg-white dark:bg-dark-800 rounded-t-2xl p-4 pb-8 z-50 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 bg-dark-200 dark:bg-dark-600 rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold text-dark-900 dark:text-white">
                  {userProfile?.displayName || userProfile?.email}
                </p>
                <p className="text-xs text-dark-400 capitalize">{role}</p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full hover:bg-dark-100 dark:hover:bg-dark-700"
              >
                <X className="w-5 h-5 text-dark-400" />
              </button>
            </div>

            {/* More nav items */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {allowedMore.map((item) => {
                const isActive = location.pathname.startsWith(item.to);
                return (
                  <button
                    key={item.to}
                    onClick={() => handleMoreNav(item.to)}
                    className={`
                      flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all
                      ${isActive
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'hover:bg-dark-50 dark:hover:bg-dark-700 text-dark-500 dark:text-dark-400'}
                    `}
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-dark-100 dark:border-dark-700 my-3" />

            {/* Theme + Logout */}
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-dark-50 dark:bg-dark-700 text-dark-600 dark:text-dark-300"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                <span className="text-sm">{isDark ? 'Kunduzgi' : 'Tungi'}</span>
              </button>
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Chiqish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-dark-800 border-t border-dark-100 dark:border-dark-700 safe-area-pb">
        <div className="flex items-center h-16 md:h-20">
          {allowedMain.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className="flex-1 flex flex-col items-center justify-center h-full gap-0.5"
              >
                <item.icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? 'text-primary-600 dark:text-primary-400' : 'text-dark-400 dark:text-dark-500'
                  }`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    isActive ? 'text-primary-600 dark:text-primary-400' : 'text-dark-400 dark:text-dark-500'
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}

          {/* More button — always show if there are more items */}
          {allowedMore.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              className="flex-1 flex flex-col items-center justify-center h-full gap-0.5"
            >
              <MoreHorizontal
                className={`w-5 h-5 transition-colors ${
                  isMoreActive ? 'text-primary-600 dark:text-primary-400' : 'text-dark-400 dark:text-dark-500'
                }`}
              />
              <span
                className={`text-[10px] font-medium ${
                  isMoreActive ? 'text-primary-600 dark:text-primary-400' : 'text-dark-400 dark:text-dark-500'
                }`}
              >
                Ko'proq
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
