import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Search, Users, Phone, Download, Calendar } from 'lucide-react';
import { formatDate, getTashkentDateString } from '../utils/helpers';
import { exportToCSV, formatExportDate } from '../utils/exportCSV';

const ITEMS_PER_PAGE = 15;

const ContactsPage = () => {
  const { userProfile } = useAuth();
  const shopId = userProfile?.shopId;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return getTashkentDateString(d);
  });
  const [endDate, setEndDate] = useState(() => getTashkentDateString());
  const [currentPage, setCurrentPage] = useState(1);

  const fetchContacts = useCallback(async () => {
    if (!shopId) return;
    try {
      const [snap, salesSnap, phonesSnap] = await Promise.all([
        getDocs(query(collection(db, 'contacts'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'sales'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId)))
      ]);

      const salesMap = {};
      salesSnap.forEach(d => {
        const sale = d.data();
        if (sale.buyerName) {
           const key = `${sale.buyerName}-${sale.buyerPhone || ''}`.toLowerCase().trim();
           if (!salesMap[key]) salesMap[key] = { items: [], totalUZS: 0, totalUSD: 0 };
           salesMap[key].items.push(`${sale.phoneName || "Noma'lum telefon"} (${sale.phoneImei || 'IMEI yo\'q'})`);
           salesMap[key].totalUZS += (sale.salePriceUZS || 0);
           salesMap[key].totalUSD += (sale.salePriceUSD || 0);
        }
      });

      const suppliersMap = {};
      phonesSnap.forEach(d => {
        const phone = d.data();
        if (phone.supplierName) {
           const key = phone.supplierName.toLowerCase().trim();
           if (!suppliersMap[key]) suppliersMap[key] = { items: [], totalUZS: 0, totalUSD: 0 };
           suppliersMap[key].items.push(`${phone.brand} ${phone.model} (${phone.imei || 'IMEI yo\'q'})`);
           suppliersMap[key].totalUZS += (phone.purchasePriceUZS || 0);
           suppliersMap[key].totalUSD += (phone.purchasePriceUSD || 0);
        }
      });

      const data = [];
      const seen = new Set();
      snap.forEach((d) => {
        const contact = { id: d.id, ...d.data() };
        const key = `${contact.name}-${contact.phone || ''}`;
        const searchKey = key.toLowerCase().trim();
        
        if (!seen.has(key)) {
          seen.add(key);
          if (contact.type === 'buyer') {
            const salesData = salesMap[searchKey] || { items: [], totalUZS: 0, totalUSD: 0 };
            contact.items = salesData.items;
            contact.count = salesData.items.length;
            contact.totalUZS = salesData.totalUZS;
            contact.totalUSD = salesData.totalUSD;
          } else {
            const supplierData = suppliersMap[contact.name.toLowerCase().trim()] || { items: [], totalUZS: 0, totalUSD: 0 };
            contact.items = supplierData.items;
            contact.count = supplierData.items.length;
            contact.totalUZS = supplierData.totalUZS;
            contact.totalUSD = supplierData.totalUSD;
          }
          data.push(contact);
        }
      });
      
      // Sort oldest first to assign sequential customer numbers
      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return aTime - bTime;
      });

      let buyerCount = 1;
      let supplierCount = 1;
      data.forEach(c => {
        if (c.type === 'buyer') {
          c.orderNumber = buyerCount++;
        } else {
          c.orderNumber = supplierCount++;
        }
      });

      // Reverse to show newest first in the list
      data.reverse();

      setContacts(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
    const matchType = !filterType || c.type === filterType;
    
    // Date filtering
    let matchDate = true;
    if (startDate || endDate) {
      const contactDate = c.createdAt?.toMillis?.() || 0;
      if (startDate) {
        const start = new Date(startDate).setHours(0, 0, 0, 0);
        if (contactDate < start) matchDate = false;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        if (contactDate > end) matchDate = false;
      }
    }

    return matchSearch && matchType && matchDate;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
              { key: 'totalUZS', label: "Jami summa (so'm)", format: (v) => v?.toLocaleString() },
              { key: 'totalUSD', label: 'Jami summa (USD)', format: (v) => v ? `$${v}` : '' },
              { key: 'items', label: 'Tovar/Xaridlar', format: (v) => v ? v.join('\n') : '' },
              { key: 'createdAt', label: "Qo'shilgan sana", format: formatExportDate },
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
              {contacts.filter((c) => c.type === 'buyer').length}
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
              {contacts.filter((c) => c.type === 'supplier').length}
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Qidirish..." className="input pl-9" />
          </div>
        </div>
        
        <div className="w-full md:w-40">
          <label className="block text-xs font-medium text-dark-400 mb-1">Turi</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input w-full">
            <option value="">Barchasi</option>
            <option value="buyer">Xaridor</option>
            <option value="supplier">Yetkazib beruvchi</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">Dan</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
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
                onChange={(e) => setEndDate(e.target.value)} 
                className="input pl-9 text-xs" 
              />
            </div>
          </div>
        </div>

        {(startDate || endDate || search || filterType) && (
          <button 
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setSearch('');
              setFilterType('');
            }}
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
                <th className="table-header">Qo'shilgan sana</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-dark-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Kontakt topilmadi</p>
                </td></tr>
              ) : (
                paginated.map((contact) => (
                  <tr key={contact.id} className="table-row">
                    <td className="table-cell font-mono text-dark-400 font-medium">
                      #{contact.orderNumber}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center text-primary-600 text-sm font-semibold flex-shrink-0">
                          {contact.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-dark-900 dark:text-white">{contact.name}</span>
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
                              <p key={idx} className="text-[10px] text-dark-400 leading-tight">
                                • {item}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="table-cell">
                      {contact.count > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            {contact.totalUZS.toLocaleString()} so'm
                          </span>
                          <span className="text-[10px] text-dark-400">
                            ${contact.totalUSD.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-dark-400">—</span>
                      )}
                    </td>
                    <td className="table-cell text-dark-400">{formatDate(contact.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} />
      </div>
    </div>
  );
};

export default ContactsPage;
