import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, query, orderBy, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Plus, Search, Edit2, Trash2, Eye, ToggleLeft, ToggleRight, Store, CheckCircle, XCircle, FileSpreadsheet, Database } from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import { generateShopExcelReport } from '../../utils/excelExport';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const PLANS = ['Free', 'Basic', 'Pro'];
const PLAN_COLORS = { Free: 'text-slate-400 bg-slate-700', Basic: 'text-blue-400 bg-blue-900/40', Pro: 'text-purple-400 bg-purple-900/40' };
const ITEMS_PER_PAGE = 10;

const AdminShopsPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingId, setExportingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, shop: null, text: '' });
  const [cleanupConfirm, setCleanupConfirm] = useState({ open: false, shop: null, text: '', loading: false });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState({ name: '', city: '', address: '', phone: '', ownerEmail: '', plan: 'Free', planExpiry: '' });

  const fetchShops = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'shops'), orderBy('createdAt', 'desc')));
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setShops(data);
    } catch { toast.error('Yuklanishda xato'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  const handleExport = async (shop) => {
    try {
      setExportingId(shop.id);
      await generateShopExcelReport(shop.id, shop.name);
      toast.success(`${shop.name} hisoboti yuklandi`);
      await auditLog(currentUser.uid, 'SuperAdmin', 'shop_report_downloaded', { shopId: shop.id, name: shop.name });
    } catch (error) {
      toast.error('Excel faylni yaratishda xato yuz berdi');
    } finally {
      setExportingId(null);
    }
  };

  const handleSave = async () => {
    try {
      if (!form.name) return toast.error('Do\'kon nomi kerak');
      const payload = {
        ...form,
        status: editingShop?.status || 'active',
        updatedAt: serverTimestamp(),
      };
      if (editingShop) {
        await updateDoc(doc(db, 'shops', editingShop.id), payload);
        await auditLog(currentUser.uid, 'SuperAdmin', 'shop_updated', { shopId: editingShop.id, name: form.name });
        toast.success('Do\'kon yangilandi');
      } else {
        payload.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, 'shops'), payload);
        await auditLog(currentUser.uid, 'SuperAdmin', 'shop_created', { shopId: ref.id, name: form.name });
        toast.success('Do\'kon qo\'shildi');
      }
      setModalOpen(false);
      setEditingShop(null);
      setForm({ name: '', city: '', address: '', phone: '', ownerEmail: '', plan: 'Free', planExpiry: '' });
      fetchShops();
    } catch { toast.error('Xato yuz berdi'); }
  };

  const toggleStatus = async (shop) => {
    const newStatus = shop.status === 'active' ? 'inactive' : 'active';
    await updateDoc(doc(db, 'shops', shop.id), { status: newStatus });
    await auditLog(currentUser.uid, 'SuperAdmin', 'shop_status_changed', { shopId: shop.id, newStatus });
    toast.success(`Do'kon ${newStatus === 'active' ? 'faollashtirildi' : 'o\'chirildi'}`);
    fetchShops();
  };

  const handleDelete = async () => {
    if (deleteConfirm.text !== deleteConfirm.shop?.name) return toast.error('Noto\'g\'ri nom');
    try {
      await deleteDoc(doc(db, 'shops', deleteConfirm.shop.id));
      await auditLog(currentUser.uid, 'SuperAdmin', 'shop_deleted', { shopId: deleteConfirm.shop.id, name: deleteConfirm.shop.name });
      toast.success('Do\'kon o\'chirildi');
      setDeleteConfirm({ open: false, shop: null, text: '' });
      fetchShops();
    } catch { toast.error('Xato yuz berdi'); }
  };

  const handleCleanup = async () => {
    if (cleanupConfirm.text !== 'TOZALASH') return toast.error('Tasdiqlash so\'zi xato');
    try {
      setCleanupConfirm(prev => ({ ...prev, loading: true }));
      const shopId = cleanupConfirm.shop.id;
      const collectionsToClear = ['sales', 'credits', 'expenses', 'returns', 'contacts', 'documents'];
      
      let totalDeleted = 0;

      // 1. Clear transaction collections
      for (const colName of collectionsToClear) {
        const q = query(collection(db, colName), where('shopId', '==', shopId));
        const snap = await getDocs(q);
        
        if (snap.empty) continue;

        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
          totalDeleted += chunk.length;
        }
      }

      // 2. Handle phones: Keep only 'Sotuvda' AND not archived/deleted
      const phoneSnap = await getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId)));
      const phonesToDelete = phoneSnap.docs.filter(d => {
        const p = d.data();
        return p.status !== 'Sotuvda' || p.isArchived === true || p.isDeleted === true;
      });

      if (phonesToDelete.length > 0) {
        for (let i = 0; i < phonesToDelete.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = phonesToDelete.slice(i, i + 500);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
          totalDeleted += chunk.length;
        }
      }

      await auditLog(currentUser.uid, 'SuperAdmin', 'shop_data_cleanup', { 
        shopId, 
        shopName: cleanupConfirm.shop.name,
        deletedCount: totalDeleted 
      });

      toast.success(`${cleanupConfirm.shop.name} ma'lumotlari tozalandi`);
      setCleanupConfirm({ open: false, shop: null, text: '', loading: false });
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
      setCleanupConfirm(prev => ({ ...prev, loading: false }));
    }
  };

  const filtered = shops.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [s.name, s.city, s.ownerEmail].some((f) => f?.toLowerCase().includes(q));
    const matchStatus = !filterStatus || s.status === filterStatus;
    const matchPlan = !filterPlan || s.plan === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Do'konlar</h1>
          <p className="text-slate-400 text-sm">{shops.length} ta do'kon</p>
        </div>
        <button
          onClick={() => { setEditingShop(null); setForm({ name: '', city: '', address: '', phone: '', ownerEmail: '', plan: 'Free', planExpiry: '' }); setModalOpen(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-all"
        >
          <Plus className="w-4 h-4" /> Do'kon qo'shish
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Do'kon nomi, shahar..." className="w-full pl-9 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Barcha status</option>
          <option value="active">Faol</option>
          <option value="inactive">Nofaol</option>
        </select>
        <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Barcha plan</option>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Do'kon</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Shahar</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Muddat</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">
                  <Store className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Do'kon topilmadi</p>
                </td></tr>
              ) : paginated.map((shop) => (
                <tr key={shop.id} className="border-t border-slate-700 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{shop.name}</p>
                    <p className="text-xs text-slate-500">{shop.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{shop.city || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PLAN_COLORS[shop.plan] || 'text-slate-400 bg-slate-700'}`}>
                      {shop.plan || 'Free'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {shop.status === 'active'
                      ? <span className="inline-flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3.5 h-3.5" /> Faol</span>
                      : <span className="inline-flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" /> Nofaol</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{formatDate(shop.planExpiry)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleExport(shop)} 
                        disabled={exportingId === shop.id}
                        className={`p-1.5 text-slate-400 hover:text-green-400 transition-colors ${exportingId === shop.id ? 'animate-pulse cursor-not-allowed' : ''}`} 
                        title="Excel yuklash"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditingShop(shop); setForm({ name: shop.name || '', city: shop.city || '', address: shop.address || '', phone: shop.phone || '', ownerEmail: shop.ownerEmail || '', plan: shop.plan || 'Free', planExpiry: shop.planExpiry || '' }); setModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-purple-400 transition-colors" title="Tahrirlash">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleStatus(shop)} className="p-1.5 text-slate-400 hover:text-yellow-400 transition-colors" title={shop.status === 'active' ? 'O\'chirish' : 'Faollashtirish'}>
                        {shop.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => setCleanupConfirm({ open: true, shop, text: '', loading: false })} 
                        className="p-1.5 text-slate-400 hover:text-amber-400 transition-colors" 
                        title="Ma'lumotlarni tozalash"
                      >
                        <Database className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm({ open: true, shop, text: '' })} className="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="O'chirish">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-700">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} />
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">{editingShop ? 'Do\'konni tahrirlash' : 'Yangi do\'kon'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Do'kon nomi *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Shahar</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Manzil</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Telefon</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Egasi email</label>
                  <input value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Plan</label>
                  <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Muddat</label>
                  <input type="date" value={form.planExpiry} onChange={(e) => setForm({ ...form, planExpiry: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600">Bekor qilish</button>
              <button onClick={handleSave} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-red-900/50 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Do'konni o'chirish</h3>
            <p className="text-slate-400 text-sm mb-4">
              Bu amalni bekor qilib bo'lmaydi. Barcha do'kon ma'lumotlari (foydalanuvchilar bilan birga) o'chib ketadi. 
              Tasdiqlash uchun do'kon nomini kiriting:
              <span className="text-red-400 font-medium"> "{deleteConfirm.shop?.name}"</span>
            </p>
            <input
              value={deleteConfirm.text}
              onChange={(e) => setDeleteConfirm({ ...deleteConfirm, text: e.target.value })}
              placeholder="Do'kon nomini kiriting..."
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm({ open: false, shop: null, text: '' })} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm.text !== deleteConfirm.shop?.name}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Confirm */}
      {cleanupConfirm.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-amber-900/50 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <Database className="w-5 h-5" />
              <h3 className="text-lg font-bold">Ma'lumotlarni tozalash</h3>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Diqqat! <span className="text-white font-medium">"{cleanupConfirm.shop?.name}"</span> do'konining barcha savdo, qarz, xarajat va foyda ma'lumotlari o'chiriladi. 
              <br/><br/>
              <span className="text-green-400 font-medium">Sotuvdagi telefonlar (aktiv inventar) saqlanib qoladi.</span>
              <br/><br/>
              Tasdiqlash uchun <span className="text-amber-400 font-bold">TOZALASH</span> so'zini yozing:
            </p>
            <input
              value={cleanupConfirm.text}
              onChange={(e) => setCleanupConfirm({ ...cleanupConfirm, text: e.target.value.toUpperCase() })}
              placeholder="TOZALASH..."
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setCleanupConfirm({ open: false, shop: null, text: '', loading: false })} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button
                onClick={handleCleanup}
                disabled={cleanupConfirm.text !== 'TOZALASH' || cleanupConfirm.loading}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {cleanupConfirm.loading ? (
                  <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Tozalanmoqda...</>
                ) : (
                  'Tozalash'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminShopsPage;
