import { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Search, Users, Phone, Download, Calendar } from 'lucide-react';
import { exportToCSV, formatExportDate } from '../utils/exportCSV';

const ITEMS_PER_PAGE = 15;

const ContactsPage = () => {
  const { userProfile } = useAuth();
  const shopId = userProfile?.shopId;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchContacts = useCallback(async () => {
    if (!shopId) return;
    try {
      const [salesSnap, phonesSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId))),
      ]);

      // --- Xaridorlar: sotuvlardan guruhlab chiqarish ---
      const buyersMap = {};
      salesSnap.forEach(d => {
        const sale = d.data();
        const name = (sale.buyerName || '').trim() || 'Nomalum';
        const phone = (sale.buyerPhone || '').trim();

        // "Nomalum" va telefonsiz xaridorlar ALOHIDA guruhda
        const isAnon = name.toLowerCase() === 'nomalum' && !phone;
        const key = isAnon ? '__anon__' : `${name.toLowerCase()}|||${phone}`;

        if (!buyersMap[key]) {
          buyersMap[key] = {
            id: key,
            name: isAnon ? 'Nomalum (anonim)' : name,
            phone,
            type: 'buyer',
            items: [],
            totalUSD: 0,
            firstDate: null,
            lastDate: null,
            isAnon,
          };
        }

        buyersMap[key].items.push(
          `${sale.phoneName || "Noma'lum telefon"} (${sale.phoneImei || "IMEI yo'q"})`
        );
        buyersMap[key].totalUSD += sale.salePriceUSD || 0;

        const t = sale.saleDate?.toMillis?.() || sale.createdAt?.toMillis?.() || 0;
        if (t && (!buyersMap[key].firstDate || t < buyersMap[key].firstDate)) buyersMap[key].firstDate = t;
        if (t && (!buyersMap[key].lastDate || t > buyersMap[key].lastDate)) buyersMap[key].lastDate = t;
      });

      // --- Yetkazib beruvchilar: telefonlardan guruhlab chiqarish ---
      const suppliersMap = {};
      phonesSnap.forEach(d => {
        const ph = d.data();
        if (ph.isDeleted || !ph.supplierName) return;
        const key = ph.supplierName.toLowerCase().trim();
        if (!suppliersMap[key]) {
          suppliersMap[key] = {
            id: key,
            name: ph.supplierName,
            phone: '',
            type: 'supplier',
            items: [],
            totalUSD: 0,
            firstDate: null,
            lastDate: null,
          };
        }
        suppliersMap[key].items.push(
          `${ph.brand} ${ph.model} (${ph.imei || "IMEI yo'q"})`
        );
        suppliersMap[key].totalUSD += ph.purchasePriceUSD || 0;

        const t = ph.createdAt?.toMillis?.() || 0;
        if (t && (!suppliersMap[key].firstDate || t < suppliersMap[key].firstDate)) suppliersMap[key].firstDate = t;
        if (t && (!suppliersMap[key].lastDate || t > suppliersMap[key].lastDate)) suppliersMap[key].lastDate = t;
      });

      const buyers = Object.values(buyersMap).map(b => ({ ...b, count: b.items.length }));
      const suppliers = Object.values(suppliersMap).map(s => ({ ...s, count: s.items.length }));
      const all = [...buyers, ...suppliers];

      // Tartib raqamlari birinchi sana bo'yicha
      const forNumbering = [...all].sort((a, b) => (a.firstDate || 0) - (b.firstDate || 0));
      let buyerNum = 1, supplierNum = 1;
      forNumbering.forEach(c => {
        if (c.type === 'buyer') c.orderNumber = buyerNum++;
        else c.orderNumber = supplierNum++;
      });

      // Eng oxirgi faollik bo'yicha tartiblash (yangilari birinchi)
      all.sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));

      setContacts(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
    const matchType = !filterType || c.type === filterType;

    // Sana filtri — oxirgi xarid/yetkazib berish sanasi bo'yicha
    let matchDate = true;
    if (startDate || endDate) {
      const t = c.lastDate || 0;
      if (startDate && t < new Date(startDate).setHours(0, 0, 0, 0)) matchDate = false;
      if (endDate && t > new Date(endDate).setHours(23, 59, 59, 999)) matchDate = false;
    }

    return matchSearch && matchType && matchDate;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const formatLastDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Kontaktlar</h1>
          <p className="text-sm text-dark-400">{contacts.length} ta kontakt</p>
        </div>
        <button
          onClick={() => exportToCSV(
            filtered,
            [
              { key: 'orderNumber', label: '#' },
              { key: 'name', label: 'Ism' },
              { key: 'phone', label: 'Telefon raqam' },
              { key: 'type', label: 'Turi', format: (v) => v === 'buyer' ? 'Xaridor' : 'Yetkazib beruvchi' },
              { key: 'count', label: 'Soni' },
              { key: 'totalUSD', label: 'Jami summa (USD)', format: (v) => v ? `$${v.toFixed(0)}` : '$0' },
              { key: 'items', label: 'Tovar/Xaridlar', format: (v) => v ? v.join('\n') : '' },
              { key: 'lastDate', label: 'Oxirgi faollik', format: (v) => v ? new Date(v).toLocaleDateString() : '' },
            ],
            'kontaktlar'
          )}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Excel yuklab olish
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Jami</p>
            <p className="text-2xl font-bold text-dark-900 dark:text-white">{contacts.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Xaridorlar</p>
            <p className="text-2xl font-bold text-dark-900 dark:text-white">
              {contacts.filter(c => c.type === 'buyer').length}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Yetkazib beruvchilar</p>
            <p className="text-2xl font-bold text-dark-900 dark:text-white">
              {contacts.filter(c => c.type === 'supplier').length}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-4 items-end">
        <div className="relative flex-1 w-full">
          <label className="block text-xs font-medium text-dark-400 mb-1">Ism yoki telefon</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Qidirish..."
              className="input pl-9"
            />
          </div>
        </div>

        <div className="w-full md:w-40">
          <label className="block text-xs font-medium text-dark-400 mb-1">Turi</label>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
            className="input w-full"
          >
            <option value="">Barchasi</option>
            <option value="buyer">Xaridor</option>
            <option value="supplier">Yetkazib beruvchi</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">Oxirgi faollik dan</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="input pl-9 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">Gacha</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="input pl-9 text-xs"
              />
            </div>
          </div>
        </div>

        {(startDate || endDate || search || filterType) && (
          <button
            onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setFilterType(''); setCurrentPage(1); }}
            className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            Tozalash
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-50 dark:bg-dark-700/50">
              <tr>
                <th className="table-header w-12">#</th>
                <th className="table-header">Ism</th>
                <th className="table-header">Telefon</th>
                <th className="table-header">Tur</th>
                <th className="table-header">Ma'lumotlar</th>
                <th className="table-header">Jami summa</th>
                <th className="table-header">Oxirgi faollik</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-dark-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Kontakt topilmadi</p>
                  </td>
                </tr>
              ) : (
                paginated.map((contact) => (
                  <tr key={contact.id} className="table-row">
                    <td className="table-cell font-mono text-dark-400 font-medium">
                      #{contact.orderNumber}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                          contact.isAnon
                            ? 'bg-dark-100 dark:bg-dark-700 text-dark-400'
                            : 'bg-primary-100 dark:bg-primary-900/30 text-primary-600'
                        }`}>
                          {contact.isAnon ? '?' : contact.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className={`font-medium ${contact.isAnon ? 'text-dark-400 italic' : 'text-dark-900 dark:text-white'}`}>
                          {contact.name}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5 text-dark-500">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{contact.phone || '—'}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={contact.type === 'buyer' ? 'badge-green' : 'badge-blue'}>
                        {contact.type === 'buyer' ? 'Xaridor' : 'Yetkazib beruvchi'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-col">
                        <span className="font-semibold text-dark-900 dark:text-white">
                          {contact.count} ta {contact.type === 'buyer' ? 'xarid' : 'tovar'}
                        </span>
                        {contact.items?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {contact.items.map((item, idx) => (
                              <p key={idx} className="text-[10px] text-dark-400 leading-tight">• {item}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      {contact.count > 0 ? (
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          ${contact.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      ) : (
                        <span className="text-dark-400">—</span>
                      )}
                    </td>
                    <td className="table-cell text-dark-400 text-sm">
                      {formatLastDate(contact.lastDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filtered.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </div>
    </div>
  );
};

export default ContactsPage;
