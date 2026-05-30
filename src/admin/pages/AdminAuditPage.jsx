import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Search, Download, ScrollText } from 'lucide-react';
import { formatDateTime, getTashkentDateString } from '../../utils/helpers';
import Pagination from '../../components/ui/Pagination';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const ITEMS_PER_PAGE = 20;

const ACTION_COLORS = {
  superadmin_login: 'text-purple-400',
  shop_created: 'text-green-400',
  shop_updated: 'text-blue-400',
  shop_deleted: 'text-red-400',
  shop_status_changed: 'text-yellow-400',
  user_updated: 'text-blue-400',
  user_status_changed: 'text-yellow-400',
  password_reset_sent: 'text-indigo-400',
  permissions_updated: 'text-amber-400',
  phone_added: 'text-green-400',
  phone_updated: 'text-blue-400',
  phone_deleted: 'text-red-400',
  sale_created: 'text-green-400',
  expense_added: 'text-orange-400',
  debt_payment: 'text-emerald-400',
  user_login: 'text-slate-400',
};

const AdminAuditPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      let q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));

      if (dateFrom && dateTo) {
        q = query(
          collection(db, 'auditLogs'),
          where('timestamp', '>=', Timestamp.fromDate(new Date(dateFrom))),
          where('timestamp', '<=', Timestamp.fromDate(new Date(dateTo + 'T23:59:59'))),
          orderBy('timestamp', 'desc')
        );
      }

      const snap = await getDocs(q);
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [l.userName, l.userId, l.actionType].some((f) => f?.toLowerCase().includes(q));
    const matchAction = !filterAction || l.actionType === filterAction;
    return matchSearch && matchAction;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const exportCSV = () => {
    const rows = filtered.map((l) => ({
      'Foydalanuvchi': l.userName,
      'ID': l.userId,
      'Amal': l.actionType,
      'Vaqt': formatDateTime(l.timestamp),
      'IP': l.ip || 'N/A',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `audit_log_${getTashkentDateString()}.xlsx`);
  };

  const uniqueActions = [...new Set(logs.map((l) => l.actionType))].sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm">{logs.length} ta yozuv</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-all">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Foydalanuvchi, amal..." className="w-full pl-9 pr-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">Barcha amallar</option>
          {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
      </div>

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Vaqt</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Foydalanuvchi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Amal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">Yuklanmoqda...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-slate-500">
                  <ScrollText className="w-12 h-12 mx-auto mb-2 opacity-30" />Log topilmadi
                </td></tr>
              ) : paginated.map((log) => (
                <tr key={log.id} className="border-t border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatDateTime(log.timestamp)}</td>
                  <td className="px-4 py-3">
                    <p className="text-white text-sm">{log.userName || 'System'}</p>
                    <p className="text-slate-600 text-xs font-mono">{log.userId?.slice(0, 8)}...</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-mono font-medium ${ACTION_COLORS[log.actionType] || 'text-slate-400'}`}>
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {log.details ? (
                      <span className="font-mono bg-slate-900 px-2 py-0.5 rounded text-slate-400">
                        {JSON.stringify(log.details).slice(0, 60)}
                      </span>
                    ) : '—'}
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
    </div>
  );
};

export default AdminAuditPage;
