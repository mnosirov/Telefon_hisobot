import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, getDocs, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Search, RotateCcw, User, Smartphone, Calendar, AlertCircle } from 'lucide-react';
import { formatDate, formatUZS, formatUSD } from '../utils/helpers';
import toast from 'react-hot-toast';

const ITEMS_PER_PAGE = 10;

const ReturnsPage = () => {
  const { userProfile } = useAuth();
  const shopId = userProfile?.shopId;
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchReturns = useCallback(async () => {
    if (!shopId) return;
    try {
      const q = query(
        collection(db, 'returns'),
        where('shopId', '==', shopId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setReturns(data);
    } catch (err) {
      console.error(err);
      toast.error('Ma\'lumotlarni yuklashda xato');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const filtered = returns.filter((r) => {
    const q = search.toLowerCase();
    return !q || 
      r.buyerName?.toLowerCase().includes(q) || 
      r.phoneName?.toLowerCase().includes(q) || 
      r.phoneImei?.includes(q);
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Qaytarishlar</h1>
          <p className="text-sm text-dark-400">{returns.length} ta qaytarilgan tovar</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Mijoz, telefon yoki IMEI orqali qidirish..." 
            className="input pl-9" 
          />
        </div>
      </div>

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paginated.length === 0 ? (
          <div className="col-span-full py-12 text-center card text-dark-400">
            <RotateCcw className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>Qaytarishlar mavjud emas</p>
          </div>
        ) : (
          paginated.map((item) => (
            <div key={item.id} className="card p-4 space-y-4 hover:shadow-md transition-shadow border-l-4 border-red-500">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-600">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-dark-900 dark:text-white">{item.phoneName}</h3>
                    <p className="text-xs font-mono text-dark-400">{item.phoneImei}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">
                    -{item.refundCurrency === 'USD'
                      ? formatUSD(item.refundAmountUSD || item.refundAmount)
                      : formatUZS(item.refundAmountUZS || item.refundAmount)
                    }
                  </p>
                  <p className="text-[10px] text-dark-400">
                    {item.refundCurrency === 'USD'
                      ? `≈ ${formatUZS(item.refundAmountUZS || item.refundAmount)}`
                      : `≈ ${formatUSD(item.refundAmountUSD || (item.refundAmount / 12700))}`
                    }
                  </p>
                  <p className="text-[10px] text-dark-300">Qaytarilgan summa</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-dark-500">
                  <User className="w-4 h-4 text-dark-400" />
                  <span>{item.buyerName}</span>
                </div>
                <div className="flex items-center gap-2 text-dark-500">
                  <Calendar className="w-4 h-4 text-dark-400" />
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>

              {item.reason && (
                <div className="bg-dark-50 dark:bg-dark-700/50 p-3 rounded-lg border border-dark-100 dark:border-dark-600">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-dark-400 uppercase font-bold tracking-wider">Sababi</p>
                      <p className="text-xs text-dark-700 dark:text-dark-300 mt-0.5">{item.reason}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-dark-100 dark:border-dark-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400">Yangi holati:</span>
                  <span className="badge-gray text-[10px]">{item.newPhoneStatus || 'Sotuvda'}</span>
                </div>
                <button 
                  onClick={() => toast.error('Hozircha o\'chirish imkoniyati yo\'q')}
                  className="text-xs text-dark-400 hover:text-red-500 transition-colors"
                >
                  Batafsil
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Pagination 
        currentPage={currentPage} 
        totalPages={totalPages} 
        onPageChange={setCurrentPage} 
        totalItems={filtered.length} 
        itemsPerPage={ITEMS_PER_PAGE} 
      />
    </div>
  );
};

export default ReturnsPage;
