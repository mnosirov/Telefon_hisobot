import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, query, orderBy, arrayUnion,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Plus, CreditCard, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react';
import { formatUZS, formatDate, isOverdue, getTashkentDateString } from '../../utils/helpers';

const PLANS = {
  Free: { label: 'Free', price: 0, features: ['5 ta telefon', 'Sotuv moduli', 'Asosiy hisobotlar'] },
  Basic: { label: 'Basic', price: 200000, features: ['Cheksiz telefon', 'Barcha modullar', 'Excel eksport'] },
  Pro: { label: 'Pro', price: 500000, features: ['Barcha Basic imkoniyatlar', 'PDF eksport', 'Multi-user', 'API kirish'] },
};

const AdminSubscriptionsPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState({ open: false, shop: null });
  const [payForm, setPayForm] = useState({ amount: '', paidBy: '', date: getTashkentDateString(), note: '' });
  const [renewModal, setRenewModal] = useState({ open: false, shop: null });
  const [renewForm, setRenewForm] = useState({ plan: 'Basic', months: 1 });

  const fetchShops = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'shops'), orderBy('createdAt', 'desc')));
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setShops(data);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  const handleRenew = async () => {
    try {
      const { shop, open: _, ...rest } = renewModal;
      const months = parseInt(renewForm.months);
      const currentExpiry = shop.planExpiry ? new Date(shop.planExpiry) : new Date();
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
      newExpiry.setMonth(newExpiry.getMonth() + months);

      await updateDoc(doc(db, 'shops', shop.id), {
        plan: renewForm.plan,
        planExpiry: newExpiry.toISOString(),
        status: 'active',
      });
      await auditLog(currentUser.uid, 'SuperAdmin', 'subscription_renewed', { shopId: shop.id, plan: renewForm.plan, months });
      toast.success('Obuna yangilandi');
      setRenewModal({ open: false, shop: null });
      fetchShops();
    } catch { toast.error('Xato yuz berdi'); }
  };

  const handleAddPayment = async () => {
    if (!payForm.amount || !payForm.paidBy) return toast.error('Maydonlarni to\'ldiring');
    try {
      await updateDoc(doc(db, 'shops', paymentModal.shop.id), {
        paymentHistory: arrayUnion({
          amount: parseFloat(payForm.amount),
          paidBy: payForm.paidBy,
          date: payForm.date,
          note: payForm.note,
          addedAt: new Date().toISOString(),
        }),
      });
      toast.success('To\'lov qo\'shildi');
      setPaymentModal({ open: false, shop: null });
      setPayForm({ amount: '', paidBy: '', date: getTashkentDateString(), note: '' });
      fetchShops();
    } catch { toast.error('Xato yuz berdi'); }
  };

  const now = new Date();
  const expiringShops = shops.filter((s) => {
    if (!s.planExpiry) return false;
    const exp = new Date(s.planExpiry);
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return exp > now && exp <= in7;
  });
  const expiredShops = shops.filter((s) => {
    if (!s.planExpiry) return false;
    return new Date(s.planExpiry) < now;
  });

  if (loading) return <div className="text-slate-400 text-center py-12">Yuklanmoqda...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Obunalar</h1>
        <p className="text-slate-400 text-sm">Do'konlar obuna holati</p>
      </div>

      {/* Alerts */}
      {expiringShops.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <p className="text-amber-300 font-medium">{expiringShops.length} ta do'kon obunasi 7 kun ichida tugaydi</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiringShops.map((s) => (
              <span key={s.id} className="text-xs bg-amber-900/50 text-amber-300 px-2 py-1 rounded">
                {s.name} — {formatDate(s.planExpiry)}
              </span>
            ))}
          </div>
        </div>
      )}

      {expiredShops.length > 0 && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <p className="text-red-300 font-medium">{expiredShops.length} ta do'kon obunasi tugagan</p>
          </div>
        </div>
      )}

      {/* Plans comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(PLANS).map(([key, plan]) => (
          <div key={key} className={`bg-slate-800 border rounded-xl p-5 ${key === 'Pro' ? 'border-purple-500/50' : 'border-slate-700'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">{plan.label}</h3>
              {key === 'Pro' && <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">Premium</span>}
            </div>
            <p className="text-2xl font-bold text-purple-400 mb-3">
              {plan.price === 0 ? 'Bepul' : formatUZS(plan.price) + '/oy'}
            </p>
            <ul className="space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              {shops.filter((s) => s.plan === key).length} ta do'kon
            </p>
          </div>
        ))}
      </div>

      {/* Shops table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h2 className="font-semibold text-white">Do'konlar obuna holati</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/30">
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase font-semibold">Do'kon</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase font-semibold">Plan</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase font-semibold">Tugash sanasi</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase font-semibold">Holat</th>
                <th className="px-4 py-3 text-left text-xs text-slate-400 uppercase font-semibold">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => {
                const expired = shop.planExpiry && new Date(shop.planExpiry) < now;
                const expiring = shop.planExpiry && !expired && new Date(shop.planExpiry) < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                return (
                  <tr key={shop.id} className="border-t border-slate-700/50 hover:bg-slate-700/20">
                    <td className="px-4 py-3 font-medium text-white">{shop.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        shop.plan === 'Pro' ? 'bg-purple-900/50 text-purple-300' :
                        shop.plan === 'Basic' ? 'bg-blue-900/50 text-blue-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>{shop.plan || 'Free'}</span>
                    </td>
                    <td className={`px-4 py-3 text-sm ${expired ? 'text-red-400' : expiring ? 'text-amber-400' : 'text-slate-300'}`}>
                      {shop.planExpiry ? formatDate(shop.planExpiry) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {expired ? <span className="text-red-400 text-xs">● Tugagan</span> :
                       expiring ? <span className="text-amber-400 text-xs">⚠ Tugayapti</span> :
                       <span className="text-green-400 text-xs">● Faol</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRenewModal({ open: true, shop }); setRenewForm({ plan: shop.plan || 'Basic', months: 1 }); }}
                          className="text-xs px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all flex items-center gap-1"
                        >
                          <CreditCard className="w-3 h-3" /> Yangilash
                        </button>
                        <button
                          onClick={() => { setPaymentModal({ open: true, shop }); setPayForm({ amount: '', paidBy: '', date: getTashkentDateString(), note: '' }); }}
                          className="text-xs px-2.5 py-1 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-all flex items-center gap-1"
                        >
                          <DollarSign className="w-3 h-3" /> To'lov
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Renew Modal */}
      {renewModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Obunani yangilash</h2>
              <button onClick={() => setRenewModal({ open: false, shop: null })} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300 font-medium">{renewModal.shop?.name}</p>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Plan</label>
                <select value={renewForm.plan} onChange={(e) => setRenewForm({ ...renewForm, plan: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {Object.keys(PLANS).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Oylar soni</label>
                <select value={renewForm.months} onChange={(e) => setRenewForm({ ...renewForm, months: parseInt(e.target.value) })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} oy</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setRenewModal({ open: false, shop: null })} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button onClick={handleRenew} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Yangilash</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">To'lov qo'shish</h2>
              <button onClick={() => setPaymentModal({ open: false, shop: null })} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-300 font-medium">{paymentModal.shop?.name}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Miqdor (UZS)</label>
                  <input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">To'lagan</label>
                  <input value={payForm.paidBy} onChange={(e) => setPayForm({ ...payForm, paidBy: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Sana</label>
                <input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Izoh</label>
                <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>

              {/* Payment history */}
              {paymentModal.shop?.paymentHistory?.length > 0 && (
                <div>
                  <p className="text-sm text-slate-400 mb-2">To'lovlar tarixi</p>
                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {paymentModal.shop.paymentHistory.slice(-5).map((p, i) => (
                      <div key={i} className="flex justify-between items-center bg-slate-700 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs text-slate-300">{p.paidBy}</p>
                          <p className="text-xs text-slate-500">{formatDate(p.date)}</p>
                        </div>
                        <span className="text-sm font-medium text-green-400">{formatUZS(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setPaymentModal({ open: false, shop: null })} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button onClick={handleAddPayment} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Qo'shish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptionsPage;
