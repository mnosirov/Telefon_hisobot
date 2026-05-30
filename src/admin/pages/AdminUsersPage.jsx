import { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, updateDoc, doc, query, orderBy, setDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  sendPasswordResetEmail, createUserWithEmailAndPassword,
  initializeAuth, browserLocalPersistence,
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { db, auth } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Search, RefreshCw, ToggleLeft, ToggleRight, Users, Shield, UserPlus } from 'lucide-react';
import { formatDate } from '../../utils/helpers';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const ROLE_STYLES = {
  superadmin: 'bg-purple-900/50 text-purple-300 border border-purple-700',
  admin: 'bg-blue-900/50 text-blue-300 border border-blue-700',
  manager: 'bg-amber-900/50 text-amber-300 border border-amber-700',
  cashier: 'bg-slate-700 text-slate-300 border border-slate-600',
};

const ITEMS_PER_PAGE = 15;

// Secondary Firebase app — prevents signing out current superadmin
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let secondaryApp;
try {
  secondaryApp = initializeApp(firebaseConfig, 'secondary');
} catch {
  // already initialized
  secondaryApp = initializeApp(firebaseConfig, 'secondary');
}
const secondaryAuth = initializeAuth(secondaryApp, { persistence: browserLocalPersistence });

const AdminUsersPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterShop, setFilterShop] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ role: '', shopId: '', displayName: '' });
  const [createModal, setCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    displayName: '', email: '', password: '', role: 'cashier', shopId: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [usersSnap, shopsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'shops')),
      ]);
      const usersData = [];
      usersSnap.forEach((d) => usersData.push({ id: d.id, ...d.data() }));
      const shopsData = [];
      shopsSnap.forEach((d) => shopsData.push({ id: d.id, ...d.data() }));
      setUsers(usersData);
      setShops(shopsData);
    } catch { toast.error('Yuklanishda xato'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.password || !createForm.displayName) {
      return toast.error('Barcha maydonlarni to\'ldiring');
    }
    if (createForm.password.length < 6) {
      return toast.error('Parol kamida 6 ta belgi bo\'lishi kerak');
    }
    try {
      setCreating(true);
      // Create via secondary app — superadmin stays logged in
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth, createForm.email, createForm.password
      );
      await secondaryAuth.signOut();

      // Save profile to Firestore
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: createForm.displayName,
        email: createForm.email,
        role: createForm.role,
        shopId: createForm.shopId || '',
        status: 'active',
        createdAt: serverTimestamp(),
      });

      await auditLog(currentUser.uid, 'SuperAdmin', 'user_created', {
        email: createForm.email, role: createForm.role,
      });

      toast.success('Foydalanuvchi yaratildi!');
      setCreateModal(false);
      setCreateForm({ displayName: '', email: '', password: '', role: 'cashier', shopId: '' });
      fetchData();
    } catch (err) {
      const msgs = {
        'auth/email-already-in-use': 'Bu email allaqachon mavjud',
        'auth/invalid-email': 'Email noto\'g\'ri',
        'auth/weak-password': 'Parol juda zaif',
      };
      toast.error(msgs[err.code] || 'Xato yuz berdi');
    } finally {
      setCreating(false);
    }
  };

  const toggleUserStatus = async (user) => {
    if (user.role === 'superadmin') return toast.error('Superadmin ni o\'chirib bo\'lmaydi');
    const newStatus = user.status === 'inactive' ? 'active' : 'inactive';
    await updateDoc(doc(db, 'users', user.id), { status: newStatus });
    await auditLog(currentUser.uid, 'SuperAdmin', 'user_status_changed', { userId: user.id, newStatus });
    toast.success(`Foydalanuvchi ${newStatus === 'active' ? 'faollashtirildi' : 'o\'chirildi'}`);
    fetchData();
  };

  const handleResetPassword = async (user) => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      await auditLog(currentUser.uid, 'SuperAdmin', 'password_reset_sent', { userId: user.id, email: user.email });
      toast.success('Parol tiklash emaili yuborildi');
    } catch { toast.error('Email yuborishda xato'); }
  };

  const handleSaveEdit = async () => {
    try {
      await updateDoc(doc(db, 'users', editUser.id), {
        role: editForm.role,
        shopId: editForm.shopId,
        displayName: editForm.displayName,
      });
      await auditLog(currentUser.uid, 'SuperAdmin', 'user_updated', { userId: editUser.id, role: editForm.role });
      toast.success('Foydalanuvchi yangilandi');
      setEditUser(null);
      fetchData();
    } catch { toast.error('Xato yuz berdi'); }
  };

  const shopName = (shopId) => shops.find((s) => s.id === shopId)?.name || '—';

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.displayName, u.email].some((f) => f?.toLowerCase().includes(q));
    const matchRole = !filterRole || u.role === filterRole;
    const matchShop = !filterShop || u.shopId === filterShop;
    return matchSearch && matchRole && matchShop;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Foydalanuvchilar</h1>
          <p className="text-slate-400 text-sm">{users.length} ta foydalanuvchi</p>
        </div>
        <button
          onClick={() => setCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-all"
        >
          <UserPlus className="w-4 h-4" /> Yangi foydalanuvchi
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { role: 'superadmin', label: 'Super Admin', color: 'text-purple-400' },
          { role: 'admin', label: 'Admin', color: 'text-blue-400' },
          { role: 'manager', label: 'Menejer', color: 'text-amber-400' },
          { role: 'cashier', label: 'Kassir', color: 'text-slate-400' },
        ].map(({ role, label, color }) => (
          <div key={role} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{users.filter((u) => u.role === role).length}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism yoki email..." className="w-full pl-9 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Barcha rol</option>
          <option value="superadmin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="manager">Menejer</option>
          <option value="cashier">Kassir</option>
        </select>
        <select value={filterShop} onChange={(e) => setFilterShop(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Barcha do'kon</option>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Foydalanuvchi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Rol</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Do'kon</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Sana</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />Foydalanuvchi topilmadi
                </td></tr>
              ) : paginated.map((user) => (
                <tr key={user.id} className="border-t border-slate-700 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-900/50 rounded-full flex items-center justify-center text-purple-300 text-sm font-semibold">
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">{user.displayName || 'Anonim'}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_STYLES[user.role] || ROLE_STYLES.cashier}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">{shopName(user.shopId)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${user.status === 'inactive' ? 'text-red-400' : 'text-green-400'}`}>
                      {user.status === 'inactive' ? '● Nofaol' : '● Faol'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditUser(user); setEditForm({ role: user.role, shopId: user.shopId || '', displayName: user.displayName || '' }); }} className="p-1.5 text-slate-400 hover:text-purple-400 transition-colors" title="Tahrirlash">
                        <Shield className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleResetPassword(user)} className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors" title="Parolni tiklash">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleUserStatus(user)} className="p-1.5 text-slate-400 hover:text-yellow-400 transition-colors">
                        {user.status === 'inactive' ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
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

      {/* Create User Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-purple-400" /> Yangi foydalanuvchi
              </h2>
              <button onClick={() => setCreateModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Ism *</label>
                <input value={createForm.displayName} onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })} placeholder="Ali Valiyev" className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email *</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="email@example.com" className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Parol * (kamida 6 belgi)</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="••••••••" className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Rol</label>
                  <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="cashier">Kassir</option>
                    <option value="manager">Menejer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Do'kon</label>
                  <select value={createForm.shopId} onChange={(e) => setCreateForm({ ...createForm, shopId: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">— Tanlang —</option>
                    {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-3 text-xs text-slate-400">
                💡 Foydalanuvchi yaratilgandan so'ng siz ularga email va parolni yuborasiz.
                Ular <strong className="text-slate-300">localhost/login</strong> dan kirishlari mumkin.
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setCreateModal(false)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button onClick={handleCreateUser} disabled={creating} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60 flex items-center gap-2">
                {creating ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Yaratilmoqda...</> : 'Yaratish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Foydalanuvchini tahrirlash</h2>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Ism</label>
                <input value={editForm.displayName} onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Rol</label>
                <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="cashier">Kassir</option>
                  <option value="manager">Menejer</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Do'kon</label>
                <select value={editForm.shopId} onChange={(e) => setEditForm({ ...editForm, shopId: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">— Do'konga biriktirilmagan —</option>
                  {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button onClick={() => setEditUser(null)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Bekor qilish</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">Saqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
