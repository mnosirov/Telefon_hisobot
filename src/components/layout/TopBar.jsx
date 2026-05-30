import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import {
  collection, query, where, getDocs, orderBy, limit,
  updateDoc, doc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../utils/helpers';

const TYPE_COLORS = {
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  success: 'bg-green-500',
};
const TYPE_BG = {
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
};

const TopBar = () => {
  const { userProfile } = useAuth();
  const [overdueCount, setOverdueCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Muddati o'tgan qarzlar
  useEffect(() => {
    const fetchOverdue = async () => {
      try {
        const q = query(collection(db, 'credits'), where('status', '!=', "To'liq to'langan"));
        const snap = await getDocs(q);
        const now = new Date();
        let count = 0;
        snap.forEach((d) => {
          const data = d.data();
          const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
          if (dueDate < now) count++;
        });
        setOverdueCount(count);
      } catch { /* ignore */ }
    };
    fetchOverdue();
  }, []);

  // Admin bildirishnomalari
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(20))
        );
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.read).length);
      } catch { /* ignore */ }
    };
    fetchNotifs();
  }, []);

  // Tashqarida bosilganda yopish
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpenNotifs = async () => {
    setNotifOpen((v) => !v);
    // O'qilmagan bildirishnomalarni o'qilgan deb belgilash
    if (!notifOpen && unreadCount > 0) {
      try {
        const batch = writeBatch(db);
        notifications.filter((n) => !n.read).forEach((n) => {
          batch.update(doc(db, 'notifications', n.id), { read: true });
        });
        await batch.commit();
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      } catch { /* ignore */ }
    }
  };

  const totalBadge = overdueCount + unreadCount;

  // Live Tashkent Clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = new Intl.DateTimeFormat('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tashkent',
  }).format(currentTime);

  const formattedDate = new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
    timeZone: 'Asia/Tashkent',
  }).format(currentTime);

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-dark-800/90 backdrop-blur-sm border-b border-dark-100 dark:border-dark-700 px-4 h-14 flex items-center justify-between gap-3">

      {/* Logo — xl dan kichik ekranlar */}
      <div className="xl:hidden flex items-center gap-2">
        <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-sm font-bold text-dark-900 dark:text-white">Tel Hisobot</span>
      </div>

      {/* Live Tashkent Clock */}
      <div className="hidden sm:flex items-center">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-50 dark:bg-dark-700/40 border border-dark-100 dark:border-dark-700/60 rounded-full font-mono text-[11px] text-dark-700 dark:text-dark-200 shadow-inner transition-all hover:bg-primary-50 dark:hover:bg-primary-900/10">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          <span className="font-semibold text-dark-955 dark:text-white tracking-wider">{formattedTime}</span>
          <span className="opacity-30">|</span>
          <span className="text-dark-500 dark:text-dark-400 font-sans font-medium capitalize">{formattedDate}</span>
        </div>
      </div>

      <div className="hidden xl:flex flex-1" />

      <div className="flex items-center gap-2">

        {/* Bildirishnomalar */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleOpenNotifs}
            className="relative p-2 text-dark-500 hover:text-dark-700 dark:text-dark-400 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {totalBadge > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalBadge > 9 ? '9+' : totalBadge}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-11 w-80 bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-100 dark:border-dark-700">
                <p className="font-semibold text-sm text-dark-900 dark:text-white">Bildirishnomalar</p>
                {overdueCount > 0 && (
                  <Link to="/credits" onClick={() => setNotifOpen(false)}
                    className="text-xs text-red-500 hover:underline">
                    {overdueCount} muddati o'tgan qarz
                  </Link>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-dark-50 dark:divide-dark-700">
                {notifications.length === 0 && overdueCount === 0 ? (
                  <p className="text-center text-sm text-dark-400 py-8">Bildirishnoma yo'q</p>
                ) : (
                  <>
                    {/* Muddati o'tgan qarz */}
                    {overdueCount > 0 && (
                      <Link to="/credits" onClick={() => setNotifOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors block">
                        <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">
                            {overdueCount} ta qarzning muddati o'tgan
                          </p>
                          <p className="text-xs text-dark-400 mt-0.5">Ko'rish uchun bosing</p>
                        </div>
                      </Link>
                    )}

                    {/* Admin bildirishnomalari */}
                    {notifications.map((n) => (
                      <div key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}>
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TYPE_COLORS[n.type] || TYPE_COLORS.info}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-dark-900 dark:text-white truncate">{n.title}</p>
                          <p className="text-xs text-dark-400 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-dark-300 mt-1">{formatDateTime?.(n.createdAt) || ''}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Foydalanuvchi */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            {(userProfile?.displayName || userProfile?.email || 'U')[0].toUpperCase()}
          </div>
          <span className="hidden md:block text-sm font-medium text-dark-700 dark:text-dark-300">
            {userProfile?.displayName || 'Foydalanuvchi'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
