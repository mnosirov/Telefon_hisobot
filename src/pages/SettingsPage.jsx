import { useState, useEffect } from 'react';
import { 
  collection, getDocs, addDoc, updateDoc, doc, 
  serverTimestamp, query, where, writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { loginToEskiz } from '../utils/smsService';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Settings, UserPlus, Shield, AlertCircle, Trash2, MessageSquare, Send, CheckCircle, XCircle, Loader2, Mail, Lock } from 'lucide-react';
import { ROLE_LABELS, BRANDS, LOW_STOCK_THRESHOLD } from '../utils/constants';
import { formatDate } from '../utils/helpers';

const SettingsPage = () => {
  const { isAdmin, currentUser, userProfile, logAction, hasRole } = useAuth();
  const { shopData, updateShopSettings } = useSettings();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUserModal, setAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', displayName: '', role: 'cashier' });
  const [submitting, setSubmitting] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(LOW_STOCK_THRESHOLD);
  const [customBrands, setCustomBrands] = useState([]);
  const [newBrand, setNewBrand] = useState('');
  const [resetModal, setResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // SMS integration states
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [eskizEmail, setEskizEmail] = useState('');
  const [eskizPassword, setEskizPassword] = useState('');
  const [eskizFrom, setEskizFrom] = useState('4546');
  const [smsOnNewCredit, setSmsOnNewCredit] = useState(true);
  const [smsOnPayment, setSmsOnPayment] = useState(true);
  const [smsOnReminder, setSmsOnReminder] = useState(true);
  
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'success' | 'error' | null
  const [savingSms, setSavingSms] = useState(false);

  // Capital/starting cash states
  const [initialCashUZS, setInitialCashUZS] = useState(0);
  const [initialCashUSD, setInitialCashUSD] = useState(0);
  const [savingCash, setSavingCash] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
        setUsers(data);
      } catch { } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (shopData) {
      setSmsEnabled(shopData.smsEnabled ?? false);
      setEskizEmail(shopData.eskizEmail ?? '');
      setEskizPassword(shopData.eskizPassword ?? '');
      setEskizFrom(shopData.eskizFrom ?? '4546');
      setSmsOnNewCredit(shopData.smsOnNewCredit ?? true);
      setSmsOnPayment(shopData.smsOnPayment ?? true);
      setSmsOnReminder(shopData.smsOnReminder ?? true);
      setInitialCashUZS(shopData.initialCashUZS ?? 0);
      setInitialCashUSD(shopData.initialCashUSD ?? 0);
    }
  }, [shopData]);

  const handleSaveInitialCash = async () => {
    try {
      setSavingCash(true);
      await updateShopSettings({
        initialCashUZS: Number(initialCashUZS) || 0,
        initialCashUSD: Number(initialCashUSD) || 0,
      });
      await logAction(currentUser.uid, 'initial_cash_updated', {
        initialCashUZS,
        initialCashUSD,
      });
      toast.success('Sarmoya sozlamalari muvaffaqiyatli saqlandi');
    } catch (err) {
      console.error(err);
      toast.error('Saqlashda xato yuz berdi');
    } finally {
      setSavingCash(false);
    }
  };

  const handleTestConnection = async () => {
    if (!eskizEmail || !eskizPassword) {
      toast.error('Iltimos, Eskiz email va parolini kiriting');
      return;
    }
    try {
      setTestingConnection(true);
      setTestResult(null);
      await loginToEskiz(eskizEmail, eskizPassword);
      setTestResult('success');
      toast.success('Eskiz.uz ulanishi muvaffaqiyatli o\'rnatildi!');
    } catch (err) {
      console.error(err);
      setTestResult('error');
      toast.error('Ulanishda xato: ' + (err.message || 'Noma\'lum xato'));
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveSmsSettings = async () => {
    try {
      setSavingSms(true);
      await updateShopSettings({
        smsEnabled,
        eskizEmail,
        eskizPassword,
        eskizFrom,
        smsOnNewCredit,
        smsOnPayment,
        smsOnReminder,
      });
      toast.success('SMS sozlamalari muvaffaqiyatli saqlandi');
    } catch (err) {
      console.error(err);
      toast.error('Saqlashda xato yuz berdi');
    } finally {
      setSavingSms(false);
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
      toast.success('Rol yangilandi');
    } catch {
      toast.error('Xato yuz berdi');
    }
  };

  const handleAddBrand = () => {
    if (newBrand.trim() && !customBrands.includes(newBrand.trim())) {
      setCustomBrands((prev) => [...prev, newBrand.trim()]);
      setNewBrand('');
      toast.success('Brand qo\'shildi');
    }
  };

  const handleResetData = async () => {
    if (userProfile?.role !== 'superadmin') {
      toast.error('Faqat Superadmin ushbu amalni bajara oladi');
      return;
    }

    const shopId = userProfile?.shopId;
    if (!shopId) {
      toast.error('Do\'kon aniqlanmadi');
      return;
    }

    try {
      setResetting(true);
      // Collections to clear completely for this shop
      const collectionsToClear = ['sales', 'credits', 'expenses', 'returns', 'contacts', 'documents'];
      
      let totalDeleted = 0;

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

      // Handle phones: Keep only 'Sotuvda' AND not archived/deleted
      const phoneSnap = await getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId)));
      const phonesToDelete = phoneSnap.docs.filter(d => {
        const p = d.data();
        // Delete if: not for sale OR archived OR soft-deleted
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

      await logAction(currentUser.uid, 'store_data_reset', { 
        shopId, 
        deletedCount: totalDeleted,
        message: 'Barcha savdo, foyda, arxiv va tranzaksiyalar tozalandi',
        timestamp: new Date().toISOString()
      });

      toast.success('Do\'kon ma\'lumotlari muvaffaqiyatli tozalandi');
      setResetModal(false);
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Tozalashda xato yuz berdi: ' + (err.message || 'Noma\'lum xato'));
    } finally {
      setResetting(false);
    }
  };

  if (!hasRole('manager')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <h2 className="text-xl font-bold text-dark-900 dark:text-white">Ruxsat yo'q</h2>
        <p className="text-dark-400 mt-2">Bu sahifaga faqat manager va undan yuqori lavozimdagi foydalanuvchilar kirishi mumkin</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Sozlamalar</h1>
        <p className="text-sm text-dark-400">Tizim va foydalanuvchi sozlamalari</p>
      </div>

      {/* Users section */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-dark-100 dark:border-dark-700">
          <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            Foydalanuvchilar
          </h2>
          <button onClick={() => setAddUserModal(true)} className="btn-primary text-xs px-3">
            <UserPlus className="w-3.5 h-3.5" /> Qo'shish
          </button>
        </div>
        <div className="divide-y divide-dark-100 dark:divide-dark-700">
          {users.length === 0 ? (
            <p className="text-center text-dark-400 py-6 text-sm">Foydalanuvchilar yo'q</p>
          ) : users.map((user) => (
            <div key={user.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 text-sm font-semibold">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-dark-900 dark:text-white">
                    {user.displayName || 'Anonim'}
                  </p>
                  <p className="text-xs text-dark-400">{user.email}</p>
                </div>
              </div>
              <select
                value={user.role}
                onChange={(e) => handleChangeRole(user.id, e.target.value)}
                disabled={user.id === currentUser?.uid}
                className="input w-32 text-xs py-1.5"
              >
                <option value="admin">Admin</option>
                <option value="manager">Menejer</option>
                <option value="cashier">Kassir</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Brands section */}
      <div className="card p-5">
        <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-primary-500" />
          Brendlar
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {[...BRANDS, ...customBrands].map((b) => (
            <span key={b} className="badge-gray px-3 py-1">{b}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            placeholder="Yangi brand..."
            className="input flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleAddBrand()}
          />
          <button onClick={handleAddBrand} className="btn-primary">Qo'shish</button>
        </div>
      </div>

      {/* Kassa boshlang'ich sarmoyasi */}
      <div className="card p-5">
        <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-emerald-500" />
          Kassa boshlang'ich sarmoyasi (Pul qo'shish)
        </h2>
        <p className="text-xs text-dark-400 mb-4">
          Telefon xarid qilish va boshqa xarajatlar uchun kassaga kiritilgan sarmoya miqdori. Bu summa kassadagi umumiy balansga qo'shiladi.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Boshlang'ich pul (UZS)</label>
            <input
              type="number"
              value={initialCashUZS}
              onChange={(e) => setInitialCashUZS(Number(e.target.value) || 0)}
              className="input w-full"
              placeholder="0"
              min={0}
            />
          </div>
          <div>
            <label className="label">Boshlang'ich pul (USD)</label>
            <input
              type="number"
              value={initialCashUSD}
              onChange={(e) => setInitialCashUSD(Number(e.target.value) || 0)}
              className="input w-full"
              placeholder="0"
              min={0}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={handleSaveInitialCash} disabled={savingCash} className="btn-primary">
            {savingCash ? 'Saqlanmoqda...' : 'Sarmoyani saqlash'}
          </button>
        </div>
      </div>

      {/* Low stock threshold */}
      <div className="card p-5">
        <h2 className="font-semibold text-dark-900 dark:text-white flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Ogohlantirish sozlamalari
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="label">Minimal inventar chegarasi</label>
            <p className="text-xs text-dark-400 mb-2">Sotuvdagi telefonlar ushbu sondan kam bo'lsa ogohlantirish beriladi</p>
            <input
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Number(e.target.value))}
              className="input w-32"
              min={1}
            />
          </div>
          <button onClick={() => toast.success('Sozlama saqlandi')} className="btn-primary self-end">
            Saqlash
          </button>
        </div>
      </div>

      {/* SMS integration section */}
      <div className="card p-5 border border-dark-100 dark:border-dark-700/50 shadow-lg relative overflow-hidden transition-all duration-300 hover:shadow-xl">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <MessageSquare className="w-24 h-24 text-primary-500" />
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-dark-100 dark:border-dark-700">
          <div>
            <h2 className="font-bold text-lg text-dark-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-500" />
              SMS Xabarnomalar (Eskiz.uz)
            </h2>
            <p className="text-xs text-dark-400 mt-1">Eskiz SMS Gateway yordamida mijozlarga avtomatik SMS xabarnomalar yuborish sozlamalari</p>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-400 font-medium">Holat:</span>
            <button 
              type="button"
              onClick={() => setSmsEnabled(!smsEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${smsEnabled ? 'bg-primary-600' : 'bg-dark-200 dark:bg-dark-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${smsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${smsEnabled ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-dark-100 text-dark-800 dark:bg-dark-700 dark:text-dark-400'}`}>
              {smsEnabled ? 'Faol' : 'O\'chirilgan'}
            </span>
          </div>
        </div>

        {smsEnabled && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-dark-400" />
                  Eskiz.uz Email
                </label>
                <input 
                  type="email" 
                  value={eskizEmail}
                  onChange={(e) => setEskizEmail(e.target.value)}
                  placeholder="Kiritilmasa, global sozlama ishlatiladi"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-dark-400" />
                  Eskiz.uz API Parol
                </label>
                <input 
                  type="password" 
                  value={eskizPassword}
                  onChange={(e) => setEskizPassword(e.target.value)}
                  placeholder="Kiritilmasa, global sozlama ishlatiladi"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-dark-400" />
                  Jo'natuvchi nomi (From)
                </label>
                <input 
                  type="text" 
                  value={eskizFrom}
                  onChange={(e) => setEskizFrom(e.target.value)}
                  placeholder="Masalan: 4546"
                  className="input w-full"
                />
                <p className="text-[10px] text-dark-400 mt-1">Eskiz.uz da tasdiqlangan sender signature yoki 4546 (default)</p>
              </div>
            </div>

            <div className="bg-dark-50 dark:bg-dark-800/40 p-4 rounded-xl border border-dark-100 dark:border-dark-700/50">
              <h3 className="text-xs font-bold text-dark-500 uppercase tracking-wider mb-3">Xabarnoma shablonlari va qoidalari</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="flex items-start gap-3 p-3 bg-white dark:bg-dark-800 rounded-lg border border-dark-100 dark:border-dark-700 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={smsOnNewCredit}
                    onChange={(e) => setSmsOnNewCredit(e.target.checked)}
                    className="mt-1 accent-primary-600 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-dark-900 dark:text-white">Yangi nasiya / muddatli to'lovda</span>
                    <p className="text-[10px] text-dark-400 mt-0.5">Nasiya rasmiylashtirilganda xaridorga shartnoma summasi va oylik to'lovlar haqida SMS yuboriladi.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 bg-white dark:bg-dark-800 rounded-lg border border-dark-100 dark:border-dark-700 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={smsOnPayment}
                    onChange={(e) => setSmsOnPayment(e.target.checked)}
                    className="mt-1 accent-primary-600 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-dark-900 dark:text-white">To'lov qabul qilinganda</span>
                    <p className="text-[10px] text-dark-400 mt-0.5">Mijoz to'lov amalga oshirganda uning qabul qilingani va qolgan qarz summasi haqida SMS yuboriladi.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 bg-white dark:bg-dark-800 rounded-lg border border-dark-100 dark:border-dark-700 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={smsOnReminder}
                    onChange={(e) => setSmsOnReminder(e.target.checked)}
                    className="mt-1 accent-primary-600 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-dark-900 dark:text-white">To'lovga 1 kun qolganda</span>
                    <p className="text-[10px] text-dark-400 mt-0.5">Mijozning oylik to'lov muddati ertaga tugaydigan bo'lsa, eslatma sifatida SMS yuboriladi.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2 border border-dark-200 dark:border-dark-600 hover:bg-dark-50 dark:hover:bg-dark-700 text-dark-700 dark:text-dark-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                  {testingConnection ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Ulanishni tekshirish
                </button>
                {testResult === 'success' && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Muvaffaqiyatli ulandi!
                  </span>
                )}
                {testResult === 'error' && (
                  <span className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Ulanishda xato
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveSmsSettings}
                disabled={savingSms}
                className="btn-primary w-full sm:w-auto"
              >
                {savingSms ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}
              </button>
            </div>
          </div>
        )}
        
        {!smsEnabled && (
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveSmsSettings}
              disabled={savingSms}
              className="btn-primary w-full sm:w-auto"
            >
              {savingSms ? 'Saqlanmoqda...' : 'Holatni saqlash'}
            </button>
          </div>
        )}
      </div>

      {/* App info */}
      <div className="card p-5">
        <h2 className="font-semibold text-dark-900 dark:text-white mb-3">Ilova haqida</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Ilova nomi', 'PhoneReport'],
            ['Versiya', '1.0.0'],
            ['Texnologiya', 'React + Firebase'],
            ['Til', "O'zbek"],
          ].map(([k, v]) => (
            <div key={k} className="bg-dark-50 dark:bg-dark-700 rounded-lg p-3">
              <p className="text-xs text-dark-400">{k}</p>
              <p className="text-sm font-medium text-dark-900 dark:text-white">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Superadmin Danger Zone */}
      {userProfile?.role === 'superadmin' && (
        <div className="card p-5 border-2 border-red-100 dark:border-red-900/30">
          <div className="flex items-center gap-2 mb-4 text-red-600">
            <Trash2 className="w-5 h-5" />
            <h2 className="font-bold">Superadmin: Xavfli hudud</h2>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">Ma'lumotlarni tozalash</h3>
            <p className="text-xs text-red-600 dark:text-red-500 mb-3">
              Ushbu amal barcha sotuvlar, qarzlar, xarajatlar, foyda hisobotlari, qaytariqlar, kontaktlar va hujjatlarni o'chirib yuboradi. 
              Arxivlangan va sotilgan telefonlar ham o'chiriladi. 
              <span className="font-bold block mt-1">Sotuvda mavjud bo'lgan telefonlar (aktiv inventar) saqlanib qoladi.</span>
            </p>
            <button 
              onClick={() => setResetModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Do'konni tozalash
            </button>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      <ConfirmDialog
        isOpen={resetModal}
        onClose={() => setResetModal(false)}
        onConfirm={handleResetData}
        loading={resetting}
        title="Ma'lumotlarni tozalashni tasdiqlaysizmi?"
        message="Diqqat! Bu amalni qaytarib bo'lmaydi. Barcha tranzaksiyalar va foyda ma'lumotlari o'chib ketadi, faqat sotuvdagi telefonlar qoladi."
        confirmLabel="Ha, hammasini tozalash"
      />
    </div>
  );
};

export default SettingsPage;
