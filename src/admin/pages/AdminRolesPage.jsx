import { useState, useEffect } from 'react';
import { collection, getDocs, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { ShieldCheck, Save } from 'lucide-react';

const DEFAULT_PERMISSIONS = {
  view_inventory: true,
  add_phone: false,
  edit_phone: false,
  delete_phone: false,
  create_sales: false,
  manage_credits: false,
  view_expenses: false,
  add_expenses: false,
  export_reports: false,
  manage_users: false,
  access_settings: false,
};

const PERMISSION_LABELS = {
  view_inventory: 'Inventarni ko\'rish',
  add_phone: 'Telefon qo\'shish',
  edit_phone: 'Telefonni tahrirlash',
  delete_phone: 'Telefonni o\'chirish',
  create_sales: 'Sotuv yaratish',
  manage_credits: 'Qarz sotuvlarni boshqarish',
  view_expenses: 'Xarajatlarni ko\'rish',
  add_expenses: 'Xarajat qo\'shish',
  export_reports: 'Hisobotni eksport qilish',
  manage_users: 'Foydalanuvchilarni boshqarish',
  access_settings: 'Sozlamalarga kirish',
};

const ROLES = [
  { key: 'cashier', label: 'Kassir', color: 'text-slate-300', defaults: { view_inventory: true, create_sales: true } },
  { key: 'manager', label: 'Menejer', color: 'text-amber-300', defaults: { view_inventory: true, add_phone: true, edit_phone: true, create_sales: true, manage_credits: true, view_expenses: true, add_expenses: true, export_reports: true } },
  { key: 'admin', label: 'Admin', color: 'text-blue-300', defaults: Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map((k) => [k, true])) },
  { key: 'superadmin', label: 'Super Admin', color: 'text-purple-300', defaults: Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map((k) => [k, true])) },
];

const AdminRolesPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const snap = await getDocs(collection(db, 'rolePermissions'));
        const data = {};
        snap.forEach((d) => { data[d.id] = d.data(); });
        // Fill defaults for roles not in DB yet
        ROLES.forEach((r) => {
          if (!data[r.key]) data[r.key] = { ...DEFAULT_PERMISSIONS, ...r.defaults };
        });
        setPermissions(data);
      } catch { } finally { setLoading(false); }
    };
    fetchPermissions();
  }, []);

  const toggle = (role, perm) => {
    if (role === 'superadmin') return; // Superadmin can't be restricted
    setPermissions((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role][perm] },
    }));
  };

  const savePermissions = async () => {
    try {
      setSaving(true);
      for (const [role, perms] of Object.entries(permissions)) {
        await setDoc(doc(db, 'rolePermissions', role), { ...perms, updatedAt: serverTimestamp() });
      }
      await auditLog(currentUser.uid, 'SuperAdmin', 'permissions_updated', {});
      toast.success('Ruxsatlar saqlandi');
    } catch { toast.error('Xato yuz berdi'); } finally { setSaving(false); }
  };

  if (loading) return <div className="text-slate-400 text-center py-12">Yuklanmoqda...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rollar va Ruxsatlar</h1>
          <p className="text-slate-400 text-sm">Har bir rol uchun ruxsatlarni sozlang</p>
        </div>
        <button onClick={savePermissions} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-60">
          <Save className="w-4 h-4" />
          {saving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="px-5 py-4 text-left text-sm font-semibold text-slate-300">Ruxsat</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="px-5 py-4 text-center text-sm font-semibold">
                    <div className="flex flex-col items-center gap-1">
                      <ShieldCheck className={`w-4 h-4 ${r.color}`} />
                      <span className={r.color}>{r.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSION_LABELS).map(([perm, label]) => (
                <tr key={perm} className="border-t border-slate-700 hover:bg-slate-700/20">
                  <td className="px-5 py-3 text-sm text-slate-300">{label}</td>
                  {ROLES.map((r) => (
                    <td key={r.key} className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggle(r.key, perm)}
                        disabled={r.key === 'superadmin'}
                        className={`w-10 h-5 rounded-full transition-all relative ${
                          permissions[r.key]?.[perm]
                            ? 'bg-purple-600'
                            : 'bg-slate-600'
                        } ${r.key === 'superadmin' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={r.key === 'superadmin' ? 'Superadminga barcha ruxsatlar berilgan' : undefined}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${permissions[r.key]?.[perm] ? 'left-5.5' : 'left-0.5'}`}
                          style={{ left: permissions[r.key]?.[perm] ? '22px' : '2px' }}
                        />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info */}
      <div className="bg-purple-950/30 border border-purple-900/30 rounded-xl p-4">
        <p className="text-purple-300 text-sm">
          💡 Superadmin uchun barcha ruxsatlar avtomatik berilgan va o'zgartirib bo'lmaydi.
          O'zgartirishlar saqlangandan so'ng darhol kuchga kiradi.
        </p>
      </div>
    </div>
  );
};

export default AdminRolesPage;
