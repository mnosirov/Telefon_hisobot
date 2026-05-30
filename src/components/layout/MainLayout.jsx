import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  // xl = 1280px dan katta ekranlar uchun sidebar
  const contentMargin = collapsed ? 'xl:ml-16' : 'xl:ml-64';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900">

      {/* Sidebar — faqat katta ekranlar (1280px+) */}
      <div className="hidden xl:block">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-300 min-h-dvh flex flex-col overflow-x-hidden ${contentMargin}`}>
        <TopBar />
        <main className="flex-1 p-3 sm:p-4 xl:p-6 pb-32 xl:pb-6">
          <Outlet />
          {/* Mobil qurilmalarda pastki menu to'sib qolmasligi uchun bo'sh joy */}
          <div className="h-20 xl:hidden pointer-events-none" aria-hidden="true" />
        </main>
      </div>

      {/* Bottom Navigation — telefon va planshetlar uchun (1280px gacha) */}
      <BottomNav />
    </div>
  );
};

export default MainLayout;
