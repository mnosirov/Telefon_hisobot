import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, serverTimestamp, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useSuperAdmin } from '../contexts/SuperAdminContext';
import toast from 'react-hot-toast';
import { Bell, Send, Users, Store } from 'lucide-react';
import { formatDateTime } from '../../utils/helpers';

const AdminNotificationsPage = () => {
  const { auditLog, currentUser } = useSuperAdmin();
  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    title: '',
    message: '',
    targetType: 'all', // 'all' | 'shops' | 'users'
    targetIds: [],
    type: 'info', // 'info' | 'warning' | 'success'
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [shopsSnap, usersSnap, notifsSnap] = await Promise.all([
          getDocs(collection(db, 'shops')),
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'notifications')),
        ]);
        const shopsData = [];
        shopsSnap.forEach((d) => shopsData.push({ id: d.id, ...d.data() }));
        const usersData = [];
        usersSnap.forEach((d) => usersData.push({ id: d.id, ...d.data() }));
        const notifsData = [];
        notifsSnap.forEach((d) => notifsData.push({ id: d.id, ...d.data() }));
        notifsData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setShops(shopsData);
        setUsers(usersData);
        setNotifications(notifsData);
      } catch {}
    };
    fetchData();
  }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) return toast.error('Sarlavha va xabar kerak');
    try {
      setSending(true);
      await addDoc(collection(db, 'notifications'), {
        ...form,
        sentBy: currentUser.uid,
        sentByName: 'SuperAdmin',
        createdAt: serverTimestamp(),
        read: false,
      });
      await auditLog(currentUser.uid, 'SuperAdmin', 'notification_sent', {
        title: form.title,
        targetType: form.targetType,
      });
      toast.success('Bildirishnoma yuborildi');
      setForm({ title: '', message: '', targetType: 'all', targetIds: [], type: 'info' });
      // Refresh
      const snap = await getDocs(collection(db, 'notifications'));
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotifications(data);
    } catch { toast.error('Xato yuz berdi'); } finally { setSending(false); }
  };

  const TYPE_STYLES = {
    info: 'border-blue-700 bg-blue-900/20',
    warning: 'border-amber-700 bg-amber-900/20',
    success: 'border-green-700 bg-green-900/20',
  };
  const TYPE_LABELS = { info: 'Ma\'lumot', warning: 'Ogohlantirish', success: 'Muvaffaqiyat' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Bildirishnomalar</h1>
        <p className="text-slate-400 text-sm">Do'konlar va foydalanuvchilarga xabar yuborish</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Form */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-400" />
            Yangi bildirishnoma
          </h2>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Sarlavha *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Bildirishnoma sarlavhasi..."
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Xabar *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              placeholder="Xabar matni..."
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tur</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="info">Ma'lumot</option>
                <option value="warning">Ogohlantirish</option>
                <option value="success">Muvaffaqiyat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Kimga</label>
              <select value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targetIds: [] })} className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="all">Hamma</option>
                <option value="shops">Do'konlar</option>
                <option value="users">Foydalanuvchilar</option>
              </select>
            </div>
          </div>

          {form.targetType === 'shops' && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">Do'konlarni tanlang</label>
              <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-700 rounded-lg p-2">
                {shops.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-600 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.targetIds.includes(s.id)}
                      onChange={(e) => setForm({ ...form, targetIds: e.target.checked ? [...form.targetIds, s.id] : form.targetIds.filter((id) => id !== s.id) })}
                      className="accent-purple-500"
                    />
                    <span className="text-sm text-slate-300">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Yuborilmoqda...' : 'Yuborish'}
          </button>
        </div>

        {/* Recent notifications */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-purple-400" />
            Yuborilgan bildirishnomalar
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">Hali bildirishnoma yo'q</p>
            ) : notifications.map((n) => (
              <div key={n.id} className={`border rounded-xl p-3 ${TYPE_STYLES[n.type] || TYPE_STYLES.info}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{n.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    {n.targetType === 'all' ? <><Users className="w-3 h-3" /> Hamma</> :
                     n.targetType === 'shops' ? <><Store className="w-3 h-3" /> Do'konlar ({n.targetIds?.length})</> :
                     <><Users className="w-3 h-3" /> Foydalanuvchilar</>}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${n.type === 'warning' ? 'bg-amber-900/50 text-amber-400' : n.type === 'success' ? 'bg-green-900/50 text-green-400' : 'bg-blue-900/50 text-blue-400'}`}>
                    {TYPE_LABELS[n.type]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminNotificationsPage;
