import { useEffect, useState } from 'react';
import {
  collection, query, where, getDocs, orderBy, limit,
  Timestamp, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import {
  TrendingUp, Smartphone, AlertCircle, DollarSign,
  ShoppingBag, ArrowUp, ArrowDown, Clock, CreditCard,
  ShieldAlert, Activity, Package, Star, Wallet,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { formatCurrency, formatDate, formatUZS, formatDateTime } from '../utils/helpers';
import { Link } from 'react-router-dom';

const COLORS = ['#7c3aed', '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

const StatCard = ({ icon: Icon, label, value, sub, color = 'purple', trend }) => {
  const colorMap = {
    purple: 'bg-purple-600',
    blue:   'bg-blue-600',
    green:  'bg-emerald-600',
    red:    'bg-red-600',
    orange: 'bg-orange-500',
    indigo: 'bg-indigo-600',
    amber:  'bg-amber-500',
  };
  return (
    <div className="bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl p-5 flex items-start gap-4 hover:border-primary-500/40 transition-all duration-200 shadow-sm">
      <div className={`w-12 h-12 ${colorMap[color]} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-dark-400">{label}</p>
        <p className="text-2xl font-bold text-dark-900 dark:text-white mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-dark-400 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium mt-1 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
};

const SubscriptionBanner = ({ shopData }) => {
  if (!shopData?.planExpiry) return null;
  const expiry = shopData.planExpiry?.toDate?.() || new Date(shopData.planExpiry);
  const now = new Date();
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft <= 0;
  const isWarning = daysLeft > 0 && daysLeft <= 7;

  if (!isExpired && !isWarning) return null;

  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 border ${
      isExpired
        ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-500/30'
        : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-500/30'
    }`}>
      <ShieldAlert className={`w-5 h-5 flex-shrink-0 ${isExpired ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
      <p className={`text-sm font-semibold ${isExpired ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
        {isExpired
          ? "Obunangiz tugagan! Iltimos, administrator bilan bog'laning."
          : `Obunangiz ${daysLeft} kun ichida tugaydi! (${formatDate(expiry)})`}
      </p>
    </div>
  );
};

const Dashboard = () => {
  const { userProfile, hasPermission } = useAuth();
  const { shopData, currency, exchangeRate, updateExchangeRate } = useSettings();
  const [stats, setStats] = useState(null);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [newRate, setNewRate] = useState(exchangeRate);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [recentSales, setRecentSales] = useState([]);
  const [overdueDebts, setOverdueDebts] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [brandData, setBrandData] = useState([]);
  const [topPhones, setTopPhones] = useState([]);
  const [allTimeCash, setAllTimeCash] = useState({ uzs: 0, usd: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setNewRate(exchangeRate);
  }, [exchangeRate]);

  const handleRateUpdate = async () => {
    try {
      await updateExchangeRate(newRate);
      setIsEditingRate(false);
    } catch {
      alert('Kursni yangilashda xato');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!userProfile) return;
      const shopId = userProfile.shopId || null;
      try {
        const now = new Date();
        const baseFilter = shopId ? [where('shopId', '==', shopId)] : [];

        const y = parseInt(selectedMonth.split('-')[0]);
        const m = parseInt(selectedMonth.split('-')[1]) - 1;
        const startOfMonth = new Date(y, m, 1);
        const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

        const [
          phonesSnap,
          creditsSnap,
          monthlySalesSnap,
          monthlyExpSnap,
          allSalesSnap,
          allExpSnap,
        ] = await Promise.all([
          getDocs(query(collection(db, 'phones'), ...baseFilter)),
          getDocs(query(collection(db, 'credits'), ...baseFilter)),
          getDocs(query(collection(db, 'sales'), ...baseFilter, where('saleDate', '>=', Timestamp.fromDate(startOfMonth)), where('saleDate', '<=', Timestamp.fromDate(endOfMonth)))),
          getDocs(query(collection(db, 'expenses'), ...baseFilter, where('date', '>=', Timestamp.fromDate(startOfMonth)), where('date', '<=', Timestamp.fromDate(endOfMonth)))),
          getDocs(query(collection(db, 'sales'), ...baseFilter)),
          getDocs(query(collection(db, 'expenses'), ...baseFilter)),
        ]);

        let mRev = 0, mRevUSD = 0, mCost = 0, mCostUSD = 0, mCount = 0;
        let mCashIn = 0, mCashInUSD = 0;
        const daysInMonth = endOfMonth.getDate();
        const dMap = {}, dMapUSD = {};
        
        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(y, m, i);
          const k = d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
          dMap[k] = 0;
          dMapUSD[k] = 0;
        }

        const bCount = {};
        const pRev = {}, pRevUSD = {};
        const recent = [];

        monthlySalesSnap.forEach((d) => {
          const data = d.data();
          const isReturned = data.status === 'Qaytarilgan';
          const isBoughtBack = data.status === 'Qayta sotib olingan';
          const isInactive = isReturned || isBoughtBack;
          const r = data.usdRate || exchangeRate || 12700;
          const uzs = data.salePriceUZS || 0;
          const usd = data.salePriceUSD || (uzs / r);

          if (isReturned) {
            const refundUZS = data.refundAmountUZS;
            const refundUSD = data.refundAmountUSD;
            
            if (refundUZS !== undefined) {
              const rAmtUZS = Number(refundUZS) || 0;
              const rAmtUSD = refundUSD !== undefined ? Number(refundUSD) : (rAmtUZS / r);
              
              const netGainUZS = uzs - rAmtUZS;
              const netGainUSD = usd - rAmtUSD;

              mRev += netGainUZS;
              mRevUSD += netGainUSD;
              
              mCashIn += netGainUZS;
              mCashInUSD += netGainUSD;
            }
          } else {
            // Normal Sale or Buyback
            mRev += uzs;
            mRevUSD += usd;
            mCost += data.purchasePriceUZS || 0;
            mCostUSD += data.purchasePriceUSD || (data.purchasePriceUZS ? data.purchasePriceUZS / r : 0);
            mCount++;

            // Cash effect
            if (isBoughtBack) {
              // For Buyback: we gained uzs when sold, but now we paid buybackPrice
              const bPriceUZS = Number(data.buybackPriceUZS || 0);
              const bPriceUSD = data.buybackPriceUSD !== undefined ? Number(data.buybackPriceUSD) : (bPriceUZS / r);
              mCashIn += (uzs - bPriceUZS);
              mCashInUSD += (usd - bPriceUSD);
            } else if (data.paymentMethod !== 'Nasiya') {
              mCashIn += uzs;
              mCashInUSD += usd;
            } else if (data.initialPayment > 0) {
              mCashIn += data.initialPayment;
              mCashInUSD += data.initialPayment / r;
            }

            const b = data.phoneName?.split(' ')[0];
            if (b) bCount[b] = (bCount[b] || 0) + 1;

            const n = data.phoneName || 'Noma\'lum';
            pRev[n] = (pRev[n] || 0) + uzs;
            pRevUSD[n] = (pRevUSD[n] || 0) + usd;
          }

          const sDate = data.saleDate?.toDate?.() || new Date(data.saleDate);
          const k = sDate.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
          if (dMap[k] !== undefined) {
            if (isReturned) {
              const rAmtUZS = Number(data.refundAmountUZS || 0);
              const rAmtUSD = data.refundAmountUSD !== undefined ? Number(data.refundAmountUSD) : (rAmtUZS / r);
              dMap[k] += (uzs - rAmtUZS);
              dMapUSD[k] += (usd - rAmtUSD);
            } else {
              // For Buyback, we don't subtract from revenue charts/stats, only from cash (which is not charted here)
              // So we treat it like a normal sale for the revenue chart
              dMap[k] += uzs;
              dMapUSD[k] += usd;
            }
          }

          recent.push({ id: d.id, ...data });
        });

        let mExp = 0, mExpUSD = 0;
        monthlyExpSnap.forEach((d) => {
          const data = d.data();
          mExp += data.amountUZS || 0;
          mExpUSD += data.amountUSD || (data.amountUZS / (exchangeRate || 12700));
        });

        // Add credit payments made this month to cash income
        creditsSnap.forEach((d) => {
          const data = d.data();
          if (data.paymentHistory) {
            data.paymentHistory.forEach(pay => {
              const pDate = new Date(pay.date);
              if (pDate >= startOfMonth && pDate <= endOfMonth) {
                // Important: Don't double count initialPayment if it's already in sales
                // Actually, initialPayment is added to paymentHistory in CreditsPage
                // But we already added initialPayment to mCashIn from Sales records above (line 173)
                // To avoid double counting, we skip 'Boshlang\'ich to\'lov' from credits.paymentHistory
                // if it's already accounted for.
                if (pay.notes !== "Boshlang'ich to'lov") {
                  const amt = pay.amount || 0;
                  mCashIn += amt;
                  mCashInUSD += amt / (exchangeRate || 12700);
                }
              }
            });
          }
        });

        const mProfit = mRev - mCost - mExp;
        const mProfitUSD = mRevUSD - mCostUSD - mExpUSD;
        const mCashNet = mCashIn - mExp;
        const mCashNetUSD = mCashInUSD - mExpUSD;

        let inStock = 0, totalP = 0, stockValue = 0, stockValueUSD = 0;
        phonesSnap.forEach((d) => {
          const data = d.data();
          if (!data.isArchived && !data.isDeleted) {
            totalP++;
            if (data.status === 'Sotuvda') {
              inStock++;
              stockValue += data.purchasePriceUZS || 0;
              stockValueUSD += data.purchasePriceUSD || (data.purchasePriceUZS ? data.purchasePriceUZS / (exchangeRate || 12700) : 0);
            }
          }
        });

        let tDebt = 0, tDebtUSD = 0, overdue = [];
        creditsSnap.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          if (data.status !== "To'liq to'langan" && data.status !== "Qaytarilgan") {
            tDebt += (data.remainingDebt || 0);
            tDebtUSD += (data.remainingDebt / (exchangeRate || 12700));
            const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
            if (dueDate < now) overdue.push(data);
          }
        });

        // ── Umumiy kassa balansini hisoblash (barcha vaqt) ──
        // Formula: Naqd kirimlar − Telefon xarid narxlari − Xarajatlar
        let totalCashUZS = 0, totalCashUSD = 0;

        // 1. Naqd sotuvlardan kirim (faqat kassaga tushgan pullar)
        allSalesSnap.forEach((d) => {
          const data = d.data();
          const r = data.usdRate || exchangeRate || 12700;
          const uzs = data.salePriceUZS || 0;
          const usd = data.salePriceUSD || (uzs / r);
          const isReturned = data.status === 'Qaytarilgan';
          const isBoughtBack = data.status === 'Qayta sotib olingan';

          if (isReturned) {
            // Qaytarilgan: qaytarilgan summani ayiramiz
            const rAmtUZS = Number(data.refundAmountUZS || 0);
            const rAmtUSD = data.refundAmountUSD !== undefined ? Number(data.refundAmountUSD) : (rAmtUZS / r);
            totalCashUZS -= rAmtUZS;
            totalCashUSD -= rAmtUSD;
          } else if (isBoughtBack) {
            // Qayta sotib olingan: buyback narxini kassadan chiqaramiz
            const bPriceUZS = Number(data.buybackPriceUZS || 0);
            const bPriceUSD = data.buybackPriceUSD !== undefined ? Number(data.buybackPriceUSD) : (bPriceUZS / r);
            totalCashUZS -= bPriceUZS;
            totalCashUSD -= bPriceUSD;
          } else if (data.paymentMethod !== 'Nasiya') {
            // Naqd sotuv: to'liq summa kassaga tushadi
            totalCashUZS += uzs;
            totalCashUSD += usd;
          } else if (data.initialPayment > 0) {
            // Nasiya: faqat boshlang'ich to'lov kassaga tushadi
            totalCashUZS += data.initialPayment;
            totalCashUSD += data.initialPayment / r;
          }
        });

        // 2. Kredit to'lovlarini qo'shish (kassaga tushgan pullar)
        creditsSnap.forEach((d) => {
          const data = d.data();
          if (data.paymentHistory) {
            data.paymentHistory.forEach(pay => {
              if (pay.notes !== "Boshlang'ich to'lov") {
                const amt = pay.amount || 0;
                totalCashUZS += amt;
                totalCashUSD += amt / (exchangeRate || 12700);
              }
            });
          }
        });

        // 3. Telefon xarid narxlarini ayirish (kassadan chiqqan pul)
        // phones kolleksiyasida BARCHA telefonlar bor (sotuvdagi + sotilganlar)
        phonesSnap.forEach((d) => {
          const data = d.data();
          if (!data.isDeleted) {
            const pUZS = data.purchasePriceUZS || 0;
            const pUSD = data.purchasePriceUSD || (pUZS / (exchangeRate || 12700));
            totalCashUZS -= pUZS;
            totalCashUSD -= pUSD;
          }
        });

        // 4. Barcha xarajatlarni ayirish (ijara, maosh, va h.k.)
        allExpSnap.forEach((d) => {
          const data = d.data();
          totalCashUZS -= (data.amountUZS || 0);
          totalCashUSD -= (data.amountUSD || (data.amountUZS / (exchangeRate || 12700)));
        });

        setAllTimeCash({ uzs: totalCashUZS, usd: totalCashUSD });

        recent.sort((a, b) => (b.saleDate?.toMillis?.() || 0) - (a.saleDate?.toMillis?.() || 0));

        setStats({
          inStock,
          totalPhones: totalP,
          stockValue: currency === 'USD' ? stockValueUSD : stockValue,
          totalDebt: currency === 'USD' ? tDebtUSD : tDebt,
          monthlyProfit: currency === 'USD' ? mProfitUSD : mProfit,
          monthlyRevenue: currency === 'USD' ? mRevUSD : mRev,
          monthlyCash: currency === 'USD' ? mCashNetUSD : mCashNet,
          monthlySalesCount: mCount
        });
        
        setRecentSales(recent.slice(0, 6));
        setOverdueDebts(overdue.slice(0, 5));
        setRevenueData(Object.entries(currency === 'USD' ? dMapUSD : dMap).map(([date, revenue]) => ({ date, revenue })));
        setBrandData(Object.entries(bCount).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5));
        setTopPhones(Object.entries(currency === 'USD' ? pRevUSD : pRev).map(([name, revenue]) => ({ name, revenue })).sort((a,b) => b.revenue - a.revenue).slice(0, 5));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userProfile, currency, exchangeRate, selectedMonth]);

  if (loading) return <div className="p-10 animate-pulse text-center text-dark-400">Yuklanmoqda...</div>;

  const expiry = shopData?.planExpiry ? (shopData.planExpiry?.toDate?.() || new Date(shopData.planExpiry)) : null;
  const daysLeft = expiry ? Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Dashboard</h1>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm text-dark-900 dark:text-white cursor-pointer"
            />
          </div>
          <p className="text-dark-400 text-sm mt-2">{new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl px-4 py-2 shadow-sm flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-dark-400 uppercase tracking-wider font-semibold">Dollar kursi</p>
              {isEditingRate ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <input type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-20 px-1 py-0.5 bg-dark-50 dark:bg-dark-700 border border-primary-500 rounded text-sm font-bold focus:outline-none" autoFocus />
                  <button onClick={handleRateUpdate} className="text-xs text-emerald-500 font-bold hover:underline">OK</button>
                  <button onClick={() => { setIsEditingRate(false); setNewRate(exchangeRate); }} className="text-xs text-red-500 font-bold hover:underline">X</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingRate(true)}>
                  <p className="text-sm font-bold text-dark-900 dark:text-white">{exchangeRate?.toLocaleString()} so'm</p>
                  <TrendingUp className="w-3 h-3 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          </div>
          {shopData && (
            <div className="flex items-center gap-3 bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl px-4 py-2.5 shadow-sm">
              <Star className="w-4 h-4 text-primary-500" />
              <div>
                <p className="text-xs text-dark-400">Joriy tarif</p>
                <p className="text-sm font-semibold text-dark-900 dark:text-white">{shopData.plan || 'Free'}</p>
              </div>
              {daysLeft !== null && (
                <div className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  daysLeft <= 0 
                    ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300' 
                    : daysLeft <= 7 
                      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300' 
                      : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                }`}>
                  {daysLeft <= 0 ? 'Tugagan' : `${daysLeft} kun qoldi`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <SubscriptionBanner shopData={shopData} />

      {/* ── Kassadagi naqd pul ── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 dark:from-emerald-700 dark:via-emerald-600 dark:to-teal-600 rounded-2xl p-6 shadow-lg shadow-emerald-500/20">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Wallet className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-emerald-100 text-sm font-medium">Kassadagi naqd pul</p>
              <p className="text-3xl font-extrabold text-white tracking-tight mt-0.5">
                {formatCurrency(currency === 'USD' ? allTimeCash.usd : allTimeCash.uzs, currency)}
              </p>
              <p className="text-emerald-200 text-xs mt-1">
                Barcha kirim − Barcha chiqim (umumiy balans)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
              (currency === 'USD' ? allTimeCash.usd : allTimeCash.uzs) >= 0
                ? 'bg-white/20 text-white'
                : 'bg-red-500/30 text-red-100'
            }`}>
              {(currency === 'USD' ? allTimeCash.usd : allTimeCash.uzs) >= 0 ? '✅ Ijobiy' : '⚠️ Salbiy'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {hasPermission('create_sales') && <StatCard icon={ShoppingBag} label="Oydagi savdo" value={formatCurrency(stats?.monthlyRevenue || 0, currency)} sub={`${stats?.monthlySalesCount || 0} ta sotuv`} color="purple" />}
        {hasPermission('view_inventory') && <StatCard icon={Smartphone} label="Sotuvda" value={stats?.inStock || 0} sub={`Tannarxi: ${formatCurrency(stats?.stockValue || 0, currency)}`} color="blue" />}
        {hasPermission('manage_credits') && <StatCard icon={AlertCircle} label="Qarzlar" value={formatCurrency(stats?.totalDebt || 0, currency)} sub={`${overdueDebts.length} ta muddati o'tgan`} color={overdueDebts.length > 0 ? 'red' : 'orange'} />}
        {hasPermission('export_reports') && <StatCard icon={DollarSign} label="Oydagi foyda" value={formatCurrency(stats?.monthlyProfit || 0, currency)} sub="Savdo − Tan narx" color={stats?.monthlyProfit >= 0 ? 'green' : 'red'} />}
        {hasPermission('export_reports') && <StatCard icon={CreditCard} label="Kassa (Naqd)" value={formatCurrency(stats?.monthlyCash || 0, currency)} sub="Kirim − Chiqim" color="indigo" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-dark-900 dark:text-white mb-4">Savdo dinamikasi</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => currency === 'USD' ? `$${v}` : `${(v / 1000000).toFixed(0)}M`} />
              <Tooltip formatter={(v) => [formatCurrency(v, currency), 'Savdo']} />
              <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="#7c3aed33" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-dark-900 dark:text-white mb-4">Brand bo'yicha sotuvlar</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={brandData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                {brandData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-dark-100 dark:border-dark-700">
            <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-500" /> So'nggi sotuvlar</h2>
            <Link to="/sales" className="text-xs text-primary-600 dark:text-primary-400">Barchasi →</Link>
          </div>
          <div className="divide-y divide-slate-700/50">
            {recentSales.map((sale) => (
              <div key={sale.id} className={`flex items-center justify-between px-5 py-3 hover:bg-dark-50 dark:hover:bg-dark-700/20 ${(sale.status === 'Qaytarilgan' || sale.status === 'Qayta sotib olingan') ? 'opacity-50' : ''}`}>
                <div>
                  <p className={`text-sm font-medium ${(sale.status === 'Qaytarilgan' || sale.status === 'Qayta sotib olingan') ? 'line-through text-dark-400' : 'text-dark-900 dark:text-white'}`}>{sale.buyerName}</p>
                  <p className="text-xs text-dark-400">{sale.phoneName} • {formatDateTime(sale.saleDate)}</p>
                </div>
                <span className={`text-sm font-semibold ${(sale.status === 'Qaytarilgan' || sale.status === 'Qayta sotib olingan') ? 'text-dark-400' : 'text-emerald-400'}`}>
                  {formatCurrency(currency === 'USD' ? sale.salePriceUSD : sale.salePriceUZS, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 border border-dark-100 dark:border-dark-700 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-dark-100 dark:border-dark-700">
            <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2"><Clock className="w-4 h-4 text-red-500" /> Muddati o'tgan qarzlar</h2>
            <Link to="/credits" className="text-xs text-primary-600 dark:text-primary-400">Barchasi →</Link>
          </div>
          <div className="divide-y divide-slate-700/50">
            {overdueDebts.map((debt) => (
              <div key={debt.id} className="flex items-center justify-between px-5 py-3 hover:bg-dark-50 dark:hover:bg-dark-700/20">
                <div>
                  <p className="text-sm font-medium text-dark-900 dark:text-white">{debt.buyerName}</p>
                  <p className="text-xs text-red-500">Muddat: {formatDate(debt.dueDate)}</p>
                </div>
                <span className="text-sm font-semibold text-red-400">{formatUZS(debt.remainingDebt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
