import { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, getDoc, serverTimestamp, writeBatch, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Settings, Upload, Plus, Trash2, Globe, DollarSign, Wrench, Tag, Database, CheckCircle, AlertTriangle, MessageSquare, Send, XCircle } from 'lucide-react';
import { loginToEskiz } from '../../utils/smsService';


const DEFAULT_BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'Huawei', 'Oppo', 'Vivo', 'Realme', 'Nokia'];
const DEFAULT_CATEGORIES = ['Ijara', 'Kommunal', 'Transport', 'Reklama', 'Ish haqi', 'Boshqa'];
const DEFAULT_COLORS = ['Qora', 'Oq', 'Kulrang', 'Kumush', 'Oltin', 'Ko\'k', 'Qizil', 'Yashil', 'Sariq', 'To\'q sariq', 'Binafsha', 'Pushti', 'Jigarrang'];

const AdminSystemSettings = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [settings, setSettings] = useState({
    appName: 'PhoneReport',
    logoUrl: '',
    currency: 'UZS',
    language: 'uz',
    maintenanceMode: false,
    brands: DEFAULT_BRANDS,
    expenseCategories: DEFAULT_CATEGORIES,
    colors: DEFAULT_COLORS,
    smsEnabled: false,
    eskizEmail: '',
    eskizPassword: '',
    eskizFrom: '4546',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newColor, setNewColor] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Migration state
  const [migrating, setMigrating] = useState(false);
  const [migrationLog, setMigrationLog] = useState([]);
  const [migrationDone, setMigrationDone] = useState(false);

  // Sync UZIMEI state
  const [syncingIMEI, setSyncingIMEI] = useState(false);
  const [syncIMEILog, setSyncIMEILog] = useState([]);
  const [syncIMEIDone, setSyncIMEIDone] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemSettings', 'global'));
        if (snap.exists()) {
          setSettings((prev) => ({ ...prev, ...snap.data() }));
        }
      } catch { } finally { setLoading(false); }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      let logoUrl = settings.logoUrl;

      if (logoFile) {
        const r = ref(storage, `system/logo_${Date.now()}`);
        await uploadBytes(r, logoFile);
        logoUrl = await getDownloadURL(r);
      }

      const payload = { ...settings, logoUrl, updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'systemSettings', 'global'), payload);
      await auditLog(currentUser.uid, 'SuperAdmin', 'system_settings_updated', {});
      toast.success('Sozlamalar saqlandi');
      setSettings((prev) => ({ ...prev, logoUrl }));
      setLogoFile(null);
    } catch { toast.error('Xato yuz berdi'); } finally { setSaving(false); }
  };

  const addBrand = () => {
    if (!newBrand.trim() || settings.brands.includes(newBrand.trim())) return;
    setSettings((prev) => ({ ...prev, brands: [...prev.brands, newBrand.trim()] }));
    setNewBrand('');
  };

  const removeBrand = (b) => setSettings((prev) => ({ ...prev, brands: prev.brands.filter((x) => x !== b) }));

  const addCategory = () => {
    if (!newCategory.trim() || settings.expenseCategories.includes(newCategory.trim())) return;
    setSettings((prev) => ({ ...prev, expenseCategories: [...prev.expenseCategories, newCategory.trim()] }));
    setNewCategory('');
  };

  const removeCategory = (c) => setSettings((prev) => ({ ...prev, expenseCategories: prev.expenseCategories.filter((x) => x !== c) }));

  const addColor = () => {
    if (!newColor.trim() || settings.colors?.includes(newColor.trim())) return;
    setSettings((prev) => ({ ...prev, colors: [...(prev.colors || []), newColor.trim()] }));
    setNewColor('');
  };

  const removeColor = (c) => setSettings((prev) => ({ ...prev, colors: prev.colors?.filter((x) => x !== c) }));

  // SMS testing connection
  const handleTestConnection = async () => {
    if (!settings.eskizEmail || !settings.eskizPassword) {
      toast.error('Iltimos, Eskiz email va parolini kiriting');
      return;
    }
    try {
      setTestingConnection(true);
      setTestResult(null);
      await loginToEskiz(settings.eskizEmail, settings.eskizPassword);
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

  // ── Migration: eski yozuvlarga shopId qo'shish ───────────────────
  const runMigration = async () => {
    try {
      setMigrating(true);
      setMigrationLog([]);
      setMigrationDone(false);
      const log = (msg) => setMigrationLog((prev) => [...prev, msg]);

      // 1. Barcha do'konlar va foydalanuvchilar
      const [shopsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'shops')),
        getDocs(collection(db, 'users')),
      ]);

      const shops = [];
      shopsSnap.forEach((d) => shops.push({ id: d.id, ...d.data() }));
      log(`${shops.length} ta do'kon topildi`);

      // 2. Har bir do'kon uchun foydalanuvchilarni topib, ma'lumotlarni yangilash
      let totalUpdated = 0;
      for (const shop of shops) {
        // Ushbu do'konga tegishli userlarni topish (ownerEmail yoki shopId bo'yicha)
        const shopUsers = [];
        usersSnap.forEach((d) => {
          const u = { id: d.id, ...d.data() };
          if (u.shopId === shop.id || u.email === shop.ownerEmail) shopUsers.push(u);
        });

        if (shopUsers.length === 0) {
          log(`⚠ "${shop.name}" - foydalanuvchi topilmadi, o'tkazib yuborildi`);
          continue;
        }

        log(`🔄 "${shop.name}" (${shop.id}) — ${shopUsers.length} ta foydalanuvchi`);

        const COLLECTIONS = ['phones', 'sales', 'credits', 'expenses', 'contacts', 'returns'];
        for (const col of COLLECTIONS) {
          // shopId yo'q yozuvlarni topish
          const snap = await getDocs(
            query(collection(db, col), where('shopId', '==', null))
          ).catch(() => null);

          // Firestore null query ishlamasa, barchasini olib filtrlash
          const allSnap = await getDocs(collection(db, col));
          const toUpdate = [];
          allSnap.forEach((d) => {
            const data = d.data();
            if (!data.shopId) {
              // Ushbu do'konga tegishli yozuvni aniqlash uchun createdBy tekshiramiz
              const createdBy = data.createdBy || data.userId || data.soldBy || data.returnedBy;
              if (createdBy && shopUsers.some((u) => u.id === createdBy)) {
                toUpdate.push(d.id);
              }
            }
          });

          if (toUpdate.length > 0) {
            const batch = writeBatch(db);
            toUpdate.forEach((id) => {
              batch.update(doc(db, col, id), { shopId: shop.id });
            });
            await batch.commit();
            log(`  ✓ ${col}: ${toUpdate.length} ta yozuv yangilandi`);
            totalUpdated += toUpdate.length;
          } else {
            log(`  — ${col}: yangilanadigan yozuv yo'q`);
          }
        }
      }

      log(`✅ Migrasiya tugadi! Jami ${totalUpdated} ta yozuv yangilandi.`);
      await auditLog(currentUser.uid, 'SuperAdmin', 'migration_run', { totalUpdated });
      setMigrationDone(true);
    } catch (err) {
      console.error(err);
      setMigrationLog((prev) => [...prev, `❌ Xato: ${err.message}`]);
    } finally {
      setMigrating(false);
    }
  };

  // ── Sync: UZIMEI holatlarini sotuvlarda to'g'rilash ─────────────────
  const runIMEISync = async () => {
    try {
      setSyncingIMEI(true);
      setSyncIMEILog([]);
      setSyncIMEIDone(false);
      const log = (msg) => setSyncIMEILog((prev) => [...prev, msg]);

      log("🔍 Barcha sotuvlar yuklanmoqda...");
      const salesSnap = await getDocs(collection(db, 'sales'));
      const sales = [];
      salesSnap.forEach((d) => sales.push({ id: d.id, ...d.data() }));
      log(`${sales.length} ta sotuv yozuvi topildi.`);

      log("🔍 Barcha telefonlar yuklanmoqda...");
      const phonesSnap = await getDocs(collection(db, 'phones'));
      const phones = {};
      phonesSnap.forEach((d) => {
        phones[d.id] = d.data();
      });
      log(`${Object.keys(phones).length} ta telefon yozuvi yuklandi.`);

      let updatedCount = 0;
      let matchedCount = 0;
      const batch = writeBatch(db);
      let batchCount = 0;

      for (const sale of sales) {
        if (!sale.phoneId) continue;
        const phone = phones[sale.phoneId];
        if (phone) {
          matchedCount++;
          const targetUZIMEI = phone.uzimei || "O'tmagan";
          const targetPhoneName = `${phone.brand} ${phone.model}${phone.ram ? ` (${phone.ram})` : ''}`;
          const targetPhoneImei = phone.imei2 ? `${phone.imei} / ${phone.imei2}` : phone.imei;

          if (sale.uzimei !== targetUZIMEI || sale.phoneName !== targetPhoneName || sale.phoneImei !== targetPhoneImei) {
            log(`✏️ Sinxronlanmoqda: ${sale.buyerName} - ${sale.phoneName} (${sale.uzimei || "yo'q"} ➔ ${targetUZIMEI})`);
            batch.update(doc(db, 'sales', sale.id), {
              uzimei: targetUZIMEI,
              phoneName: targetPhoneName,
              phoneImei: targetPhoneImei,
            });
            updatedCount++;
            batchCount++;

            if (batchCount === 500) {
              await batch.commit();
              batchCount = 0;
            }
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      log(`✅ Sinxronizatsiya yakunlandi!`);
      log(`🔄 ${matchedCount} ta mos kelgan telefondan ${updatedCount} ta sotuv yozuvining ma'lumotlari yangilandi.`);
      await auditLog(currentUser.uid, 'SuperAdmin', 'imei_sync_run', { updatedCount });
      setSyncIMEIDone(true);
      toast.success("Sotuvlar muvaffaqiyatli sinxronlandi!");
    } catch (err) {
      console.error(err);
      setSyncIMEILog((prev) => [...prev, `❌ Xato yuz berdi: ${err.message}`]);
      toast.error("Xatolik yuz berdi");
    } finally {
      setSyncingIMEI(false);
    }
  };
  // ────────────────────────────────────────────────────────────────

  if (loading) return <div className="text-slate-400 text-center py-12">Yuklanmoqda...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tizim Sozlamalari</h1>
          <p className="text-slate-400 text-sm">Global ilova konfiguratsiyasi</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
          <Settings className="w-4 h-4" />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-400" /> Umumiy
          </h2>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Ilova nomi</label>
            <input
              value={settings.appName}
              onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Logo</label>
            <div className="flex items-center gap-3">
              {settings.logoUrl && <img src={settings.logoUrl} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-slate-700 p-1" />}
              <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all">
                <Upload className="w-4 h-4" />
                {logoFile ? logoFile.name : 'Logo yuklash'}
                <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Valyuta</label>
              <select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="UZS">UZS (so'm)</option>
                <option value="USD">USD (dollar)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Til</label>
              <select value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="uz">O'zbek</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </div>

          {/* Maintenance Mode */}
          <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-white flex items-center gap-2"><Wrench className="w-4 h-4 text-amber-400" /> Texnik ishlash rejimi</p>
              <p className="text-xs text-slate-500">Yoqilsa, foydalanuvchilar ilovaga kira olmaydi</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
              className={`w-12 h-6 rounded-full transition-all relative ${settings.maintenanceMode ? 'bg-red-600' : 'bg-slate-600'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.maintenanceMode ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* Firebase config (read-only) */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-400" /> Firebase Config (faqat o'qish)
          </h2>
          {[
            ['PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID],
            ['AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN],
            ['STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET],
            ['SENDER_ID', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-900 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500 mb-0.5">{k}</p>
              <p className="text-sm font-mono text-slate-300">{v || '—'}</p>
            </div>
          ))}
        </div>

        {/* Global SMS Settings (Eskiz.uz) */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4 col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700">
            <div>
              <h2 className="font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" /> Global SMS Xabarnomalar (Eskiz.uz)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Tizimdagi barcha do'konlar foydalanishi mumkin bo'lgan default Eskiz.uz sozlamalari
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Holat:</span>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, smsEnabled: !settings.smsEnabled })}
                className={`w-12 h-6 rounded-full transition-all relative ${settings.smsEnabled ? 'bg-purple-600' : 'bg-slate-600'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.smsEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </div>

          {settings.smsEnabled && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Eskiz.uz Email</label>
                  <input
                    type="email"
                    value={settings.eskizEmail || ''}
                    onChange={(e) => setSettings({ ...settings, eskizEmail: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Eskiz.uz API Parol</label>
                  <input
                    type="password"
                    value={settings.eskizPassword || ''}
                    onChange={(e) => setSettings({ ...settings, eskizPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Jo'natuvchi nomi (From)</label>
                  <input
                    type="text"
                    value={settings.eskizFrom || ''}
                    onChange={(e) => setSettings({ ...settings, eskizFrom: e.target.value })}
                    placeholder="Masalan: 4546"
                    className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2 border border-slate-600 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                >
                  {testingConnection ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Ulanishni tekshirish
                </button>
                {testResult === 'success' && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Muvaffaqiyatli ulandi!
                  </span>
                )}
                {testResult === 'error' && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Ulanishda xato
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Brands */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-purple-400" /> Telefon Brendlari
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {settings.brands.map((b) => (
            <div key={b} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-lg group">
              <span className="text-sm text-slate-300">{b}</span>
              <button onClick={() => removeBrand(b)} className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Yangi brand..." onKeyPress={(e) => e.key === 'Enter' && addBrand()} className="flex-1 px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={addBrand} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> Qo'shish
          </button>
        </div>
      </div>

      {/* Expense Categories */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-amber-400" /> Xarajat Kategoriyalari
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {settings.expenseCategories.map((c) => (
            <div key={c} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-lg">
              <span className="text-sm text-slate-300">{c}</span>
              <button onClick={() => removeCategory(c)} className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Yangi kategoriya..." onKeyPress={(e) => e.key === 'Enter' && addCategory()} className="flex-1 px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <button onClick={addCategory} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 flex items-center gap-1">
            <Plus className="w-4 h-4" /> Qo'shish
          </button>
        </div>
      </div>

      {/* Colors */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-emerald-400" /> Telefon Ranglari
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {settings.colors?.map((c) => (
            <div key={c} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 rounded-lg group">
              <span className="text-sm text-slate-300">{c}</span>
              <button onClick={() => removeColor(c)} className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            value={newColor} 
            onChange={(e) => setNewColor(e.target.value)} 
            placeholder="Yangi rang..." 
            onKeyPress={(e) => e.key === 'Enter' && addColor()} 
            className="flex-1 px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" 
          />
          <button onClick={addColor} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-1 transition-colors">
            <Plus className="w-4 h-4" /> Qo'shish
          </button>
        </div>
      </div>
      {/* Migration Tool */}
      <div className="bg-slate-800 border border-amber-600/30 rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
          <Database className="w-5 h-5 text-amber-400" />
          Ma'lumotlar Migrasiyasi
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Eski yozuvlarda <code className="bg-slate-700 px-1 rounded text-amber-300">shopId</code> maydoni yo'q.
          Bu tugma eski telefon, sotuv, qarz, xarajat va kontaktlarga to'g'ri <code className="bg-slate-700 px-1 rounded text-amber-300">shopId</code> qo'shadi.
        </p>

        {migrationDone && (
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-500/30 rounded-lg p-3 mb-4">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-300 text-sm font-medium">Migrasiya muvaffaqiyatli bajarildi!</p>
          </div>
        )}

        {migrationLog.length > 0 && (
          <div className="bg-slate-900 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
            {migrationLog.map((line, i) => (
              <p key={i} className="text-xs font-mono text-slate-300 leading-6">{line}</p>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={runMigration}
            disabled={migrating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-all"
          >
            {migrating ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Migrasiya bajarilmoqda...</>
            ) : (
              <><Database className="w-4 h-4" /> Migrasiyani boshlash</>
            )}
          </button>
          {!migrationDone && (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              Birinchi marta ishga tushirishdan oldin zaxira nusxa oling
            </div>
          )}
        </div>
      </div>

      {/* UZIMEI & Phone Sync Tool */}
      <div className="bg-slate-800 border border-purple-600/30 rounded-xl p-6">
        <h2 className="font-semibold text-white flex items-center gap-2 mb-2">
          <Database className="w-5 h-5 text-purple-400" />
          Sotuvlardagi UZIMEI va Telefon Ma'lumotlarini Sinxronlash
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Tizimdagi ba'zi sotuv yozuvlari va u yerda aks etgan UZIMEI holatlari mos kelmay qolgan bo'lsa, ushbu tugma yordamida barcha sotuv yozuvlarini ularning tegishli telefondagi eng so'nggi ma'lumotlari (UZIMEI holati, telefon nomi va IMEI) bilan to'liq sinxronlashtirishingiz mumkin.
        </p>

        {syncIMEIDone && (
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-500/30 rounded-lg p-3 mb-4">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-300 text-sm font-medium">Sinxronizatsiya muvaffaqiyatli bajarildi!</p>
          </div>
        )}

        {syncIMEILog.length > 0 && (
          <div className="bg-slate-900 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
            {syncIMEILog.map((line, i) => (
              <p key={i} className="text-xs font-mono text-slate-300 leading-6">{line}</p>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={runIMEISync}
            disabled={syncingIMEI}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-all"
          >
            {syncingIMEI ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sinxronlanmoqda...</>
            ) : (
              <><Database className="w-4 h-4" /> Ma'lumotlarni Sinxronlash</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSystemSettings;
