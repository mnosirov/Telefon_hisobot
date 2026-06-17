import { useState, useEffect } from 'react';
import { collection, query, updateDoc, doc, where, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { Search, RotateCcw, Trash2, Smartphone, Store, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDate, formatUZS } from '../../utils/helpers';
import toast from 'react-hot-toast';

const AdminTrashPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch shops for labels
    const unsubShops = onSnapshot(collection(db, 'shops'), (snap) => {
      const shopMap = {};
      snap.forEach(d => shopMap[d.id] = d.data().name);
      setShops(shopMap);
    }, (err) => {
      console.error("Trash Page - shops fetch error:", err);
    });

    // Real-time listener — faqat o'chirilgan telefonlarni olish
    const unsubPhones = onSnapshot(
      query(collection(db, 'phones'), where('isDeleted', '==', true)),
      (snap) => {
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.deletedAt?.toMillis?.() || 0) - (a.deletedAt?.toMillis?.() || 0));
      setItems(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Firestore Trash Query Error:', err);
      setError(err.message);
      setLoading(false);
      toast.error('Ma\'lumotlarni yuklashda xato: ' + err.message);
    });

    return () => {
      unsubShops();
      unsubPhones();
    };
  }, []);

  const handleRestore = async (item) => {
    if (!window.confirm('Ushbu ma\'lumotni tiklamoqchimisiz?')) return;
    try {
      await updateDoc(doc(db, 'phones', item.id), {
        isDeleted: false,
        restoredAt: new Date(),
        restoredBy: 'superadmin'
      });
      toast.success('Ma\'lumot tiklandi');
    } catch (err) {
      console.error(err);
      toast.error('Tiklashda xato');
    }
  };

  const handlePermanentDelete = async (item) => {
    if (!window.confirm('DIQQAT! Ushbu ma\'lumot butunlay o\'chiriladi. Tiklab bo\'lmaydi. Davom etasizmi?')) return;
    try {
      await deleteDoc(doc(db, 'phones', item.id));
      toast.success('Butunlay o\'chirildi');
    } catch (err) {
      console.error(err);
      toast.error('O\'chirishda xato');
    }
  };

  const filtered = items.filter(i => 
    !search || 
    i.model?.toLowerCase().includes(search.toLowerCase()) || 
    i.imei?.includes(search) ||
    shops[i.shopId]?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <LoadingSpinner />
      <p className="text-slate-500 animate-pulse">Ma'lumotlar yuklanmoqda...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Savatcha (O'chirilganlar)</h1>
          <p className="text-sm text-slate-400">Do'konlar tomonidan o'chirilgan barcha ma'lumotlar</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Yangilash
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-200">Xatolik yuz berdi</p>
            <p className="text-xs text-red-300/80 mt-1">{error}</p>
            <p className="text-xs text-red-400 mt-2">Maslahat: Firestore-da indeks yaratish talab qilinayotgan bo'lishi mumkin. Brauzer konsolini (F12) tekshiring.</p>
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 p-4 rounded-xl shadow-sm border border-slate-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Model, IMEI yoki do'kon nomi bo'yicha qidirish..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="bg-slate-900/50 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/50 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ma'lumot</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Do'kon</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">O'chirilgan sana</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Trash2 className="w-12 h-12 opacity-10" />
                    <p className="text-lg font-medium text-slate-600">Savatcha bo'sh yoki ma'lumot topilmadi</p>
                    <p className="text-sm opacity-60 text-slate-700">Jami o'chirilganlar: {items.length} ta</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                        <Smartphone className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{item.brand} {item.model}</p>
                        <p className="text-xs text-slate-500 font-mono">IMEI: {item.imei}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-blue-900/20 text-blue-400 rounded-full text-xs font-medium border border-blue-900/30">
                      {shops[item.shopId] || item.shopId}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {formatDate(item.deletedAt)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                        title="Tiklash"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(item)}
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Butunlay o'chirish"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminTrashPage;
