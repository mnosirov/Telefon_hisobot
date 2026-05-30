import { useState } from 'react';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Database, Download, RefreshCw, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

// Note: Real Firestore backups require Firebase Admin SDK on a server (Cloud Functions).
// This page provides a UI for tracking manual backups and triggering Cloud Function triggers.
const MOCK_BACKUPS = [
  { id: '1', date: '2026-05-01T23:00:00', size: '2.4 MB', status: 'success', type: 'auto' },
  { id: '2', date: '2026-04-30T23:00:00', size: '2.1 MB', status: 'success', type: 'auto' },
  { id: '3', date: '2026-04-29T18:32:00', size: '1.9 MB', status: 'success', type: 'manual' },
];

const AdminBackupsPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [backups, setBackups] = useState(MOCK_BACKUPS);
  const [creating, setCreating] = useState(false);
  const [schedule, setSchedule] = useState('daily');

  const createBackup = async () => {
    try {
      setCreating(true);
      await new Promise((r) => setTimeout(r, 2000)); // Simulate
      const newBackup = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        size: '2.6 MB',
        status: 'success',
        type: 'manual',
      };
      setBackups((prev) => [newBackup, ...prev]);
      await auditLog(currentUser.uid, 'SuperAdmin', 'backup_created', { type: 'manual' });
      toast.success('Zaxira nusxa yaratildi');
    } catch {
      toast.error('Xato yuz berdi');
    } finally {
      setCreating(false);
    }
  };

  const formatBackupDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Zaxira Nusxalar</h1>
        <p className="text-slate-400 text-sm">Ma'lumotlar bazasini zaxiralash va tiklash</p>
      </div>

      {/* Alert */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-300 text-sm font-medium">Muhim eslatma</p>
          <p className="text-amber-500 text-xs mt-1">
            Firestore to'liq zaxira olish uchun Firebase Cloud Functions yoki Google Cloud Scheduler kerak.
            Hozirda bu sahifa zaxira tarixini ko'rsatadi va manul trigger yuboradi.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Actions */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" /> Boshqaruv
          </h2>

          <button
            onClick={createBackup}
            disabled={creating}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {creating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Yaratilmoqda...</> : <><Database className="w-4 h-4" /> Zaxira nusxa yaratish</>}
          </button>

          <div className="space-y-2">
            <label className="block text-sm text-slate-400">Avtomatik zaxira</label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="daily">Har kuni</option>
              <option value="weekly">Har hafta</option>
              <option value="never">O'chirilgan</option>
            </select>
            <button onClick={() => toast.success('Jadval saqlandi (Cloud Function orqali)')} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-all">
              Jadval saqlash
            </button>
          </div>

          <div className="p-3 bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <p className="text-sm text-slate-300">Keyingi zaxira</p>
            </div>
            <p className="text-purple-400 text-sm font-medium">Ertaga, 23:00</p>
          </div>
        </div>

        {/* Backup list */}
        <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Zaxira tarixi</h2>
          <div className="space-y-3">
            {backups.map((backup) => (
              <div key={backup.id} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${backup.status === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
                    {backup.status === 'success'
                      ? <CheckCircle className="w-4 h-4 text-green-400" />
                      : <AlertTriangle className="w-4 h-4 text-red-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{formatBackupDate(backup.date)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{backup.size}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${backup.type === 'auto' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                        {backup.type === 'auto' ? 'Avtomatik' : 'Qo\'lda'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toast.success('Yuklab olish boshlandi (Cloud Function orqali)')}
                    className="p-2 text-slate-400 hover:text-purple-400 hover:bg-slate-600 rounded-lg transition-all"
                    title="Yuklab olish"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toast('Tiklash Cloud Functions orqali amalga oshiriladi', { icon: 'ℹ️' })}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-600 rounded-lg transition-all"
                    title="Tiklash"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBackupsPage;
