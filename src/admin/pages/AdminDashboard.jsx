import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  Store, Users, Smartphone, TrendingUp, AlertCircle,
  CreditCard, Activity, ShieldAlert, Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { formatUZS, formatDate } from '../../utils/helpers';

const COLORS = ['#7c3aed', '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'purple' }) => {
  const colors = {
    purple: 'bg-purple-600',
    blue:   'bg-blue-600',
    green:  'bg-green-600',
    red:    'bg-red-600',
    orange: 'bg-orange-600',
    indigo: 'bg-indigo-600',
  };
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex items-start gap-4 hover:border-purple-500/40 transition-all duration-200">
      <div className={`w-12 h-12 ${colors[color]} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats]               = useState(null);
  const [revenueData, setRevenueData]   = useState([]);
  const [brandData, setBrandData]       = useState([]);
  const [topShops, setTopShops]         = useState([]);
  const [expiringPlans, setExpiringPlans] = useState([]);
  const [loading, setLoading]           = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [shopsSnap, usersSnap, phonesSnap, salesSnap, creditsSnap, trashSnap] = await Promise.all([
          getDocs(collection(db, 'shops')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'phones')),
          getDocs(query(collection(db, 'sales'), orderBy('saleDate', 'desc'), limit(2000))),
          getDocs(collection(db, 'credits')),
          getDocs(query(collection(db, 'phones'), where('isDeleted', '==', true))),
        ]);

        // ── Shops ──────────────────────────────────────────────────
        const shops = [];
        shopsSnap.forEach((d) => shops.push({ id: d.id, ...d.data() }));
        const activeShops = shops.filter((s) => s.status === 'active').length;

        // ── Users ──────────────────────────────────────────────────
        const users = [];
        usersSnap.forEach((d) => users.push({ id: d.id, ...d.data() }));
        const activeUsers = users.filter((u) => u.status !== 'inactive').length;

        // ── Phones ─────────────────────────────────────────────────
        const totalPhones = phonesSnap.size;

        // ── Sales → revenue, brand, per-shop revenue, daily chart ──
        let totalRevenue = 0;
        const brandCount  = {};
        const shopRevenue = {}; // shopId → revenue
        const dayMap      = {}; // "MMM D" → revenue (last 30 days)

        // Build day keys for last 30 days
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
          dayMap[key] = 0;
        }

        salesSnap.forEach((d) => {
          const data = d.data();
          if (data.status === 'Qaytarilgan') return;

          const amount = data.salePriceUZS || 0;
          totalRevenue += amount;

          // Brand count
          const brand = (data.phoneName || '').split(' ')[0] || 'Boshqa';
          brandCount[brand] = (brandCount[brand] || 0) + 1;

          // Per-shop revenue
          const sid = data.shopId || '__unknown__';
          shopRevenue[sid] = (shopRevenue[sid] || 0) + amount;

          // Daily revenue (last 30 days)
          const saleDate = data.saleDate?.toDate?.() || new Date(data.saleDate);
          const key = saleDate.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
          if (dayMap[key] !== undefined) dayMap[key] += amount;
        });

        // ── Credits → total debt ───────────────────────────────────
        let totalDebt = 0;
        creditsSnap.forEach((d) => {
          const data = d.data();
          if (data.status !== "To'liq to'langan") totalDebt += data.remainingDebt || 0;
        });

        // ── Revenue chart (real) ───────────────────────────────────
        const revenueArr = Object.entries(dayMap).map(([date, revenue]) => ({ date, revenue }));

        // ── Brand pie (real) ──────────────────────────────────────
        const brandArr = Object.entries(brandCount)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        // ── Top shops by real revenue ──────────────────────────────
        const topShopsData = shops
          .map((s) => ({ name: s.name || "Do'kon", revenue: shopRevenue[s.id] || 0 }))
          .filter((s) => s.revenue > 0)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        // ── Expiring subscriptions (within 7 days) ─────────────────
        const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const expiring = shops.filter((s) => {
          if (!s.planExpiry) return false;
          const exp = s.planExpiry?.toDate?.() || new Date(s.planExpiry);
          return exp > now && exp <= in7days;
        });

        // ── Active subscriptions count ─────────────────────────────
        const activeSubs = shops.filter((s) => {
          if (!s.planExpiry) return false;
          const exp = s.planExpiry?.toDate?.() || new Date(s.planExpiry);
          return exp > now;
        }).length;

        setStats({
          totalShops: shopsSnap.size,
          activeShops,
          totalUsers: usersSnap.size,
          activeUsers,
          totalPhones,
          totalRevenue,
          totalDebt,
          totalSales: salesSnap.size,
          activeSubs,
          deletedCount: trashSnap.size,
        });
        setRevenueData(revenueArr);
        setBrandData(brandArr);
        setTopShops(topShopsData);
        setExpiringPlans(expiring);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-slate-800 rounded-xl p-5 h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Global Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Barcha do'konlar bo'yicha umumiy ko'rinish</p>
      </div>

      {/* Expiring alert */}
      {expiringPlans.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-sm">
            <span className="font-semibold">{expiringPlans.length} ta do'kon</span> obunasi 7 kun ichida tugaydi:{' '}
            {expiringPlans.map((s) => s.name).join(', ')}
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Store}       label="Jami do'konlar"    value={stats?.totalShops  || 0} sub={`${stats?.activeShops} ta faol`}  color="purple" />
        <StatCard icon={Users}       label="Foydalanuvchilar"  value={stats?.totalUsers  || 0} sub={`${stats?.activeUsers} ta faol`}  color="blue"   />
        <StatCard icon={Smartphone}  label="Jami telefonlar"   value={stats?.totalPhones || 0} sub="Barcha do'konlarda"               color="indigo" />
        <StatCard icon={TrendingUp}  label="Jami savdo"      value={formatUZS(stats?.totalRevenue || 0)} sub="Barcha vaqt"          color="green"  />
        <StatCard icon={Activity}    label="Jami sotuvlar"     value={stats?.totalSales  || 0}                                        color="indigo" />
        <StatCard icon={AlertCircle} label="Jami qarz"         value={formatUZS(stats?.totalDebt || 0)}                               color="red"    />
        <StatCard icon={CreditCard}  label="Faol obunalar"     value={stats?.activeSubs  || 0}                                        color="orange" />
        <div onClick={() => navigate('/superadmin/trash')} className="cursor-pointer">
          <StatCard 
            icon={Trash2}        
            label="Savatcha"          
            value={stats?.deletedCount || 0} 
            sub="O'chirilgan ma'lumotlar" 
            color="red" 
          />
        </div>
        <StatCard
          icon={Store}
          label="Obuna tugaydi"
          value={expiringPlans.length}
          sub="7 kun ichida"
          color={expiringPlans.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Area Chart — real data */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Savdo (so'nggi 30 kun)</h2>
          {revenueData.every((d) => d.revenue === 0) ? (
            <div className="flex items-center justify-center h-[220px] text-slate-500 text-sm">
              So'nggi 30 kunda sotuv yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} interval={6} />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`}
                />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                  labelStyle={{ color: '#cbd5e1' }}
                  formatter={(v) => [formatUZS(v), 'Savdo']}
                />
                <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="url(#revenueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Brand Pie — real data */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-base font-semibold text-white mb-4">Brand bo'yicha sotuvlar</h2>
          {brandData.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-slate-500 text-sm">
              Ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={brandData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {brandData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                  formatter={(v, n) => [v, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Shops Bar Chart — real data */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-base font-semibold text-white mb-4">Top do'konlar (savdo bo'yicha)</h2>
        {topShops.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">
            Do'konlar bo'yicha sotuv ma'lumoti topilmadi
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, topShops.length * 44)}>
            <BarChart data={topShops} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`}
              />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
                formatter={(v) => [formatUZS(v), 'Savdo']}
              />
              <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
