import { useState, useEffect } from 'react';
import {
  collection, query, where, getDocs, orderBy, Timestamp, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatUZS, formatUSD, formatCurrency, formatDate, getStatusBadge, getDebtStatusBadge, isOverdue, getTashkentDateString } from '../utils/helpers';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Download, FileText, TrendingUp, AlertTriangle, Package, Eye, Smartphone } from 'lucide-react';
import Modal from '../components/ui/Modal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'sales', label: 'Sotuvlar', icon: TrendingUp },
  { id: 'imports', label: 'Kirimlar', icon: Smartphone },
  { id: 'inventory', label: 'Inventar', icon: Package },
  { id: 'debts', label: 'Qarzlar', icon: AlertTriangle },
  { id: 'expenses', label: 'Xarajatlar', icon: FileText },
  { id: 'profit', label: 'Foyda tahlili', icon: BarChart3 },
];
const ReportsPage = () => {
  const { userProfile } = useAuth();
  const { currency, exchangeRate } = useSettings();
  const shopId = userProfile?.shopId;
  const [activeTab, setActiveTab] = useState('sales');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    sales: [], inventory: [], debts: [], expenses: [], imports: [],
  });
  const [detailModal, setDetailModal] = useState({ open: false, phone: null, loading: false });
  const [dateFrom, setDateFrom] = useState(
    getTashkentDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  );
  const [dateTo, setDateTo] = useState(getTashkentDateString());

  const fetchReport = async () => {
    setLoading(true);
    try {
      const from = Timestamp.fromDate(new Date(dateFrom));
      const to = Timestamp.fromDate(new Date(dateTo + 'T23:59:59'));

      // Sales
      const salesSnap = await getDocs(
        query(
          collection(db, 'sales'),
          where('shopId', '==', shopId),
          where('saleDate', '>=', from),
          where('saleDate', '<=', to)
        )
      );
      // Inventory (all phones) — fetched first to build phoneMap for sale enrichment
      const phonesSnap = await getDocs(
        query(collection(db, 'phones'), where('shopId', '==', shopId))
      );
      const phoneMap = {};
      const inventory = [];
      const imports = [];
      phonesSnap.forEach((d) => {
        const pData = d.data();
        phoneMap[d.id] = pData;
        if (!pData.isDeleted) {
          if (!pData.isArchived) {
            inventory.push({ id: d.id, ...pData });
          }
          const pDate = pData.purchaseDate || (pData.createdAt && typeof pData.createdAt.toDate === 'function' ? getTashkentDateString(pData.createdAt.toDate()) : null);
          if (pDate && pDate >= dateFrom && pDate <= dateTo) {
            imports.push({ id: d.id, ...pData });
          }
        }
      });

      // Enrich sales with current phone uzimei (sale record may have stale "O'tmagan")
      const sales = [];
      salesSnap.forEach((d) => {
        const s = { id: d.id, ...d.data() };
        if (s.phoneId && phoneMap[s.phoneId]?.uzimei) {
          s.uzimei = phoneMap[s.phoneId].uzimei;
        }
        sales.push(s);
      });

      // Debts
      const debtsSnap = await getDocs(
        query(collection(db, 'credits'), where('shopId', '==', shopId))
      );
      const debts = [];
      debtsSnap.forEach((d) => debts.push({ id: d.id, ...d.data() }));

      // Expenses
      const expSnap = await getDocs(
        query(
          collection(db, 'expenses'),
          where('shopId', '==', shopId),
          where('date', '>=', from),
          where('date', '<=', to)
        )
      );
      const expenses = [];
      expSnap.forEach((d) => expenses.push({ id: d.id, ...d.data() }));

      setData({ sales, inventory, debts, expenses, imports });
    } catch (err) {
      console.error(err);
      toast.error('Hisobotni yuklashda xato. Indeks yaratilmagan bo\'lishi mumkin.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (item, type = 'phone') => {
    setDetailModal({ open: true, phone: null, loading: true });
    try {
      if (type === 'sale') {
        if (item.phoneId) {
          const phoneDoc = await getDoc(doc(db, 'phones', item.phoneId));
          if (phoneDoc.exists()) {
            setDetailModal({ open: true, phone: { id: phoneDoc.id, ...phoneDoc.data() }, loading: false });
            return;
          }
        }
        setDetailModal({ open: true, phone: { brand: item.phoneName?.split(' ')[0], model: item.phoneName, imei: item.phoneImei, notes: item.notes, uzimei: item.uzimei, warranty: item.warranty }, loading: false });
      } else {
        // Already have full phone data in inventory tab
        setDetailModal({ open: true, phone: item, loading: false });
      }
    } catch (err) {
      console.error('Error fetching phone details:', err);
      toast.error('Ma\'lumotlarni yuklashda xato');
      setDetailModal({ open: false, phone: null, loading: false });
    }
  };

  useEffect(() => { 
    if (shopId) {
      fetchReport(); 
    }
  }, [shopId, dateFrom, dateTo]);

  const exportCSV = () => {
    let rows = [];
    if (activeTab === 'sales') {
      rows = data.sales.map((s) => ({
        'Xaridor': s.buyerName,
        'Telefon': s.phoneName,
        'IMEI': s.phoneImei,
        'Sotuv narxi': s.salePriceUZS,
        "To'lov usuli": s.paymentMethod,
        'Foyda': s.profit,
        'Sana': formatDate(s.saleDate),
      }));
    } else if (activeTab === 'imports') {
      rows = data.imports.map((p) => ({
        'Brand': p.brand,
        'Model': p.model,
        'IMEI': p.imei,
        'Holat': p.condition,
        'Status': p.status,
        'Yetkazib beruvchi': p.supplierName || '—',
        'Xarid narxi': p.purchasePriceUZS,
        'Sana': p.purchaseDate || formatDate(p.createdAt),
      }));
    } else if (activeTab === 'inventory') {
      rows = data.inventory.map((p) => ({
        'Brand': p.brand,
        'Model': p.model,
        'IMEI': p.imei,
        'Holat': p.condition,
        'Status': p.status,
        'Xarid narxi': p.purchasePriceUZS,
      }));
    } else if (activeTab === 'debts') {
      rows = data.debts.map((d) => ({
        'Xaridor': d.buyerName,
        'Telefon': d.phoneName,
        'Jami narx': d.totalPrice,
        'Qolgan qarz': d.remainingDebt,
        'Status': d.status,
        'Muddat': formatDate(d.dueDate),
      }));
    } else {
      rows = data.expenses.map((e) => ({
        'Kategoriya': e.category,
        'Miqdor': e.amountUZS,
        'Sana': formatDate(e.date),
        'Izoh': e.description,
      }));
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hisobot');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `hisobot_${activeTab}_${dateFrom}.xlsx`);
  };

  const exportPDF = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text('Hisobot', 14, 15);
    pdf.setFontSize(10);
    pdf.text(`Sana: ${dateFrom} - ${dateTo}`, 14, 22);

    let y = 30;
    if (activeTab === 'sales') {
      data.sales.forEach((s) => {
        pdf.text(`${s.buyerName} | ${s.phoneName} | ${formatUZS(s.salePriceUZS)} | ${formatDate(s.saleDate)}`, 14, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 15; }
      });
    } else if (activeTab === 'imports') {
      data.imports.forEach((p) => {
        pdf.text(`${p.brand} ${p.model} | IMEI: ${p.imei} | ${p.condition} | ${p.supplierName || '—'} | ${formatUZS(p.purchasePriceUZS)} | ${p.purchaseDate || formatDate(p.createdAt)}`, 14, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 15; }
      });
    } else if (activeTab === 'inventory') {
      data.inventory.forEach((p) => {
        pdf.text(`${p.brand} ${p.model} | IMEI: ${p.imei} | ${p.condition} | ${p.status} | ${formatUZS(p.purchasePriceUZS)}`, 14, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 15; }
      });
    } else if (activeTab === 'debts') {
      data.debts.forEach((d) => {
        pdf.text(`${d.buyerName} | ${d.phoneName} | Jami: ${formatUZS(d.totalAmountUZS)} | Qolgan: ${formatUZS(d.remainingDebt)} | Status: ${d.status}`, 14, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 15; }
      });
    } else if (activeTab === 'expenses') {
      data.expenses.forEach((e) => {
        pdf.text(`${e.category} | ${formatUZS(e.amountUZS)} | ${formatDate(e.date)} | ${e.description || ''}`, 14, y);
        y += 8;
        if (y > 280) { pdf.addPage(); y = 15; }
      });
    }

    pdf.save(`hisobot_${activeTab}_${dateFrom}.pdf`);
  };

  const totalSalesRevenue = data.sales.reduce((a, s) => {
    const rate = s.usdRate || exchangeRate || 12700;
    const sPrice = currency === 'USD' ? (s.salePriceUSD || s.salePriceUZS / rate) : (s.salePriceUZS || 0);
    
    if (s.status === 'Qaytarilgan') {
      if (s.refundAmountUZS !== undefined) {
        const rAmount = currency === 'USD' ? (s.refundAmountUSD || (s.refundAmountUZS / rate)) : (s.refundAmountUZS || 0);
        return a + (sPrice - rAmount);
      }
      return a;
    }
    // For 'Qayta sotib olingan' and normal sales, keep full revenue
    return a + sPrice;
  }, 0);

  const totalSalesProfit = data.sales.reduce((a, s) => {
    const rate = s.usdRate || exchangeRate || 12700;
    const sPrice = currency === 'USD' ? (s.salePriceUSD || s.salePriceUZS / rate) : (s.salePriceUZS || 0);
    
    if (s.status === 'Qaytarilgan') {
      if (s.refundAmountUZS !== undefined) {
        const rAmount = currency === 'USD' ? (s.refundAmountUSD || (s.refundAmountUZS / rate)) : (s.refundAmountUZS || 0);
        return a + (sPrice - rAmount);
      }
      return a;
    }

    const pPrice = currency === 'USD' 
      ? (s.purchasePriceUSD || (s.purchasePriceUZS ? s.purchasePriceUZS / rate : 0))
      : (s.purchasePriceUZS || 0);
    return a + (sPrice - pPrice);
  }, 0);

  const totalExpenses = data.expenses.reduce((a, e) => a + (currency === 'USD' ? (e.amountUSD || e.amountUZS / (exchangeRate || 12700)) : (e.amountUZS || 0)), 0);
  
  // Calculate Actual Cash Flow (Kassa) for the period
  const totalCashIncome = data.sales.reduce((a, s) => {
    const rate = s.usdRate || exchangeRate || 12700;
    const sPrice = currency === 'USD' ? (s.salePriceUSD || s.salePriceUZS / rate) : (s.salePriceUZS || 0);
    
    if (s.status === 'Qaytarilgan') {
      const refundUZS = s.refundAmountUZS;
      const refundUSD = s.refundAmountUSD;

      if (refundUZS !== undefined) {
        const rAmount = currency === 'USD' 
          ? (refundUSD || (Number(refundUZS || 0) / rate)) 
          : (Number(refundUZS || 0));
        return a + (sPrice - rAmount);
      }
      return a;
    }
    
    if (s.paymentMethod === 'Nasiya') {
      const initPay = currency === 'USD' ? ((s.initialPayment || 0) / rate) : (s.initialPayment || 0);
      return a + initPay;
    }
    
    return a + sPrice;
  }, 0);

  const creditPaymentsTotal = data.debts.reduce((a, d) => {
    let pSum = 0;
    if (d.paymentHistory) {
      d.paymentHistory.forEach(pay => {
        const pDate = new Date(pay.date);
        const from = new Date(dateFrom);
        const to = new Date(dateTo + 'T23:59:59');
        // Avoid double counting initial payment from sales record
        if (pDate >= from && pDate <= to && pay.notes !== "Boshlang'ich to'lov") {
          pSum += currency === 'USD' ? (pay.amount / (exchangeRate || 12700)) : (pay.amount || 0);
        }
      });
    }
    return a + pSum;
  }, 0);

  const totalImportsCost = data.imports.reduce((acc, p) => acc + (currency === 'USD' ? (p.purchasePriceUSD || 0) : (p.purchasePriceUZS || 0)), 0);
  const totalKassa = totalCashIncome + creditPaymentsTotal - totalExpenses - totalImportsCost;
  const totalDebt = data.debts.filter((d) => d.status !== "To'liq to'langan" && d.status !== 'Qaytarilgan').reduce((a, d) => a + (currency === 'USD' ? (d.remainingDebtUSD || d.remainingDebt / (exchangeRate || 12700)) : (d.remainingDebt || 0)), 0);
  const netProfit = totalSalesProfit - totalExpenses;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Hisobotlar</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-auto" />
          <span className="text-dark-400">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-auto" />
          <button onClick={fetchReport} className="btn-primary">Ko'rish</button>
          <button onClick={exportCSV} className="btn-secondary">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportPDF} className="btn-secondary">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>
 
       {/* Summary stats */}
       <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
         <div className="card p-4 text-center">
           <p className="text-xs text-dark-400">Jami Savdo</p>
           <p className="text-lg font-bold text-green-600">{formatCurrency(totalSalesRevenue, currency)}</p>
         </div>
         <div className="card p-4 text-center">
           <p className="text-xs text-dark-400">Brutto Foyda</p>
           <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalSalesProfit, currency)}</p>
         </div>
         <div className="card p-4 text-center border-l-4 border-emerald-500">
           <p className="text-xs text-dark-400">Sof Foyda</p>
           <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-primary-600' : 'text-red-600'}`}>{formatCurrency(netProfit, currency)}</p>
         </div>
         <div className="card p-4 text-center bg-indigo-50/50 dark:bg-indigo-900/10">
           <p className="text-xs text-dark-400 font-bold text-indigo-600">Kassa (Naqd pul)</p>
           <p className={`text-lg font-bold ${totalKassa >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>{formatCurrency(totalKassa, currency)}</p>
         </div>
         <div className="card p-4 text-center">
           <p className="text-xs text-dark-400">Qolgan qarz</p>
           <p className="text-lg font-bold text-orange-600">{formatCurrency(totalDebt, currency)}</p>
         </div>
       </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
        <div className="flex gap-1 bg-dark-100 dark:bg-dark-700 p-1 rounded-xl w-fit min-w-full sm:min-w-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-dark-600 text-dark-900 dark:text-white shadow-sm'
                  : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {/* Sales Tab */}
            {activeTab === 'sales' && (
              <table className="w-full">
                <thead className="bg-dark-50 dark:bg-dark-700/50">
                  <tr>
                    <th className="table-header">Xaridor</th>
                    <th className="table-header">Telefon</th>
                    <th className="table-header">To'lov</th>
                    <th className="table-header">Sotuv narxi</th>
                    <th className="table-header">Foyda</th>
                    <th className="table-header">Sana</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-dark-400">Ma'lumot topilmadi</td></tr>
                  ) : data.sales.map((s) => {
                    const isReturned = s.status === 'Qaytarilgan';
                    const isBoughtBack = s.status === 'Qayta sotib olingan';
                    const isInactive = isReturned || isBoughtBack;
                    return (
                      <tr key={s.id} className={`table-row ${isInactive ? 'opacity-50' : ''}`}>
                        <td className={`table-cell font-medium ${isInactive ? 'line-through' : ''}`}>{s.buyerName}</td>
                        <td className={`table-cell ${isInactive ? 'line-through text-dark-400' : ''}`}>
                          <div className="flex flex-col items-start gap-1">
                            <p>{s.phoneName}</p>
                            <p className={`text-xs font-mono ${s.uzimei?.toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400 font-bold' : s.uzimei?.toLowerCase().includes("o'tmagan") ? 'text-red-500 dark:text-red-400' : 'text-dark-400'}`}>{s.phoneImei}</p>
                            {s.uzimei && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded w-max ${
                                s.uzimei.toLowerCase().includes("o'tgan") ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                UZIMEI: {s.uzimei}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className={isInactive ? 'badge-gray' : 'badge-blue'}>{s.paymentMethod}</span>
                        </td>
                        <td className={`table-cell font-semibold ${isInactive ? 'text-dark-400 line-through' : 'text-green-600'}`}>
                          {formatCurrency(currency === 'USD' ? s.salePriceUSD : s.salePriceUZS, currency)}
                        </td>
                        <td className={`table-cell font-semibold ${isInactive ? 'text-dark-400 line-through' : 'text-emerald-600'}`}>
                          {(() => {
                            const rate = s.usdRate || exchangeRate || 12700;
                            const sPrice = currency === 'USD' ? (s.salePriceUSD || s.salePriceUZS / rate) : (s.salePriceUZS || 0);
                            const pPrice = currency === 'USD' 
                              ? (s.purchasePriceUSD || (s.purchasePriceUZS ? s.purchasePriceUZS / rate : 0))
                              : (s.purchasePriceUZS || 0);
                            return formatCurrency(sPrice - pPrice, currency);
                          })()}
                        </td>
                        <td className="table-cell text-dark-400">
                          <span>{formatDate(s.saleDate)}</span>
                          {s.warranty && <p className="text-[10px] text-blue-500 font-medium mt-0.5">Kafolat: {s.warranty}</p>}
                          {isReturned && <p className="text-[10px] text-red-500 font-medium mt-0.5">Qaytarilgan</p>}
                          {isBoughtBack && <p className="text-[10px] text-blue-500 font-medium mt-0.5">Qayta sotib olingan</p>}
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={() => handleViewDetails(s, 'sale')}
                            className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-500 transition-colors"
                            title="Tafsilotlar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Imports Tab */}
            {activeTab === 'imports' && (
              <div>
                <div className="p-4 bg-dark-50 dark:bg-dark-700/30 border-b border-dark-100 dark:border-dark-700 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs text-dark-400 font-medium">Jami kirim telefonlar</p>
                      <p className="text-lg font-bold text-dark-900 dark:text-white">{data.imports.length} ta</p>
                    </div>
                    <div className="border-l border-dark-200 dark:border-dark-600 pl-4">
                      <p className="text-xs text-dark-400 font-medium">Kirim tannarxi</p>
                      <p className="text-lg font-bold text-primary-600">
                        {formatCurrency(
                          data.imports.reduce((acc, p) => acc + (currency === 'USD' ? (p.purchasePriceUSD || 0) : (p.purchasePriceUZS || 0)), 0),
                          currency
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <table className="w-full">
                  <thead className="bg-dark-50 dark:bg-dark-700/50">
                    <tr>
                      <th className="table-header">Brand</th>
                      <th className="table-header">Model</th>
                      <th className="table-header">IMEI</th>
                      <th className="table-header">Holat</th>
                      <th className="table-header">Status</th>
                      <th className="table-header">Yetkazib beruvchi</th>
                      <th className="table-header">Xarid narxi</th>
                      <th className="table-header">Sana</th>
                      <th className="table-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imports.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-dark-400">Ma'lumot topilmadi</td></tr>
                    ) : data.imports.map((p) => (
                      <tr key={p.id} className="table-row">
                        <td className="table-cell font-medium">{p.brand}</td>
                        <td className="table-cell">{p.model} {p.ram ? `(${p.ram})` : ''}</td>
                        <td className="table-cell font-mono text-xs">
                          <div className="flex flex-col items-start gap-1">
                            <span className={p.uzimei?.toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400 font-bold' : p.uzimei?.toLowerCase().includes("o'tmagan") ? 'text-red-500 dark:text-red-400' : ''}>
                              {p.imei}
                            </span>
                            {p.uzimei && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded w-max ${
                                p.uzimei.toLowerCase().includes("o'tgan") ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>
                                UZIMEI: {p.uzimei}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="table-cell"><span className="badge-gray">{p.condition}</span></td>
                        <td className="table-cell"><span className={getStatusBadge(p.status)}>{p.status}</span></td>
                        <td className="table-cell text-dark-500">{p.supplierName || '—'}</td>
                        <td className="table-cell font-semibold text-primary-600">
                          {formatCurrency(currency === 'USD' ? p.purchasePriceUSD : p.purchasePriceUZS, currency)}
                        </td>
                        <td className="table-cell text-dark-400">
                          {p.purchaseDate || formatDate(p.createdAt)}
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={() => handleViewDetails(p, 'phone')}
                            className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-500 transition-colors"
                            title="Tafsilotlar"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
              <table className="w-full">
                <thead className="bg-dark-50 dark:bg-dark-700/50">
                  <tr>
                    <th className="table-header">Brand</th>
                    <th className="table-header">Model</th>
                    <th className="table-header">IMEI</th>
                    <th className="table-header">Holat</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Xarid narxi</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.inventory.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-dark-400">Ma'lumot topilmadi</td></tr>
                  ) : data.inventory.map((p) => (
                    <tr key={p.id} className="table-row">
                      <td className="table-cell font-medium">{p.brand}</td>
                      <td className="table-cell">{p.model}</td>
                      <td className="table-cell">
                        <div className="flex flex-col items-start gap-1">
                          <p className={`text-xs font-mono ${p.uzimei?.toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400 font-bold' : p.uzimei?.toLowerCase().includes("o'tmagan") ? 'text-red-500 dark:text-red-400' : 'text-dark-400'}`}>
                            {p.imei}
                          </p>
                          {p.uzimei && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded w-max ${
                              p.uzimei.toLowerCase().includes("o'tgan") ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              UZIMEI: {p.uzimei}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell"><span className="badge-gray">{p.condition}</span></td>
                      <td className="table-cell"><span className={getStatusBadge(p.status)}>{p.status}</span></td>
                      <td className="table-cell text-dark-400">
                        {formatCurrency(currency === 'USD' ? p.purchasePriceUSD : p.purchasePriceUZS, currency)}
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => handleViewDetails(p, 'phone')}
                          className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-500 transition-colors"
                          title="Tafsilotlar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Debts Tab */}
            {activeTab === 'debts' && (
              <table className="w-full">
                <thead className="bg-dark-50 dark:bg-dark-700/50">
                  <tr>
                    <th className="table-header">Xaridor</th>
                    <th className="table-header">Telefon</th>
                    <th className="table-header">Jami</th>
                    <th className="table-header">Qolgan qarz</th>
                    <th className="table-header">Muddat</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.debts.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-dark-400">Ma'lumot topilmadi</td></tr>
                  ) : data.debts.map((d) => {
                    const overdue = d.status !== "To'liq to'langan" && isOverdue(d.dueDate);
                    return (
                      <tr key={d.id} className={`table-row ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                        <td className="table-cell font-medium">{d.buyerName}</td>
                        <td className="table-cell">{d.phoneName}</td>
                        <td className="table-cell">
                          {formatCurrency(currency === 'USD' ? d.totalAmountUSD : d.totalAmountUZS, currency)}
                        </td>
                        <td className="table-cell font-semibold text-red-600">
                          {formatCurrency(currency === 'USD' ? (d.totalAmountUSD - d.paidAmountUSD) : d.remainingDebt, currency)}
                        </td>
                        <td className={`table-cell ${overdue ? 'text-red-500 font-medium' : 'text-dark-400'}`}>
                          {formatDate(d.dueDate)}
                        </td>
                        <td className="table-cell"><span className={getDebtStatusBadge(d.status)}>{d.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Profit Tab */}
            {activeTab === 'profit' && (
              <table className="w-full">
                <thead className="bg-dark-50 dark:bg-dark-700/50">
                  <tr>
                    <th className="table-header">Telefon / Manba</th>
                    <th className="table-header">Sotuv</th>
                    <th className="table-header">Tan narxi / Qaytarish</th>
                    <th className="table-header">Foyda</th>
                    <th className="table-header">Holat</th>
                    <th className="table-header">Sana</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-dark-400">Ma'lumot topilmadi</td></tr>
                  ) : data.sales.map((s) => {
                    const isReturned = s.status === 'Qaytarilgan';
                    const isBoughtBack = s.status === 'Qayta sotib olingan';
                    const isInactive = isReturned || isBoughtBack;
                    const rate = s.usdRate || exchangeRate || 12700;
                    const sPrice = currency === 'USD' ? (s.salePriceUSD || s.salePriceUZS / rate) : (s.salePriceUZS || 0);
                    
                    let pPriceDisplay = '';
                    let profit = 0;
                    
                    if (isReturned) {
                      if (s.refundAmountUZS !== undefined) {
                        const rAmount = currency === 'USD' ? (s.refundAmountUSD || (s.refundAmountUZS / rate)) : (s.refundAmountUZS || 0);
                        pPriceDisplay = `Qaytarildi: ${formatCurrency(rAmount, currency)}`;
                        profit = sPrice - rAmount;
                      } else {
                        pPriceDisplay = 'To\'liq qaytarilgan';
                        profit = 0;
                      }
                    } else {
                      const pPrice = currency === 'USD' 
                        ? (s.purchasePriceUSD || (s.purchasePriceUZS ? s.purchasePriceUZS / rate : 0))
                        : (s.purchasePriceUZS || 0);
                      pPriceDisplay = `Tan narxi: ${formatCurrency(pPrice, currency)}`;
                      profit = sPrice - pPrice;
                    }

                    return (
                      <tr key={s.id} className="table-row">
                        <td className="table-cell">
                          <p className="font-medium">{s.phoneName}</p>
                          <p className="text-xs text-dark-400">{s.buyerName}</p>
                        </td>
                        <td className="table-cell text-dark-900 dark:text-white">{formatCurrency(sPrice, currency)}</td>
                        <td className="table-cell text-dark-400 text-xs">{pPriceDisplay}</td>
                        <td className={`table-cell font-bold ${profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {profit > 0 ? '+' : ''}{formatCurrency(profit, currency)}
                        </td>
                        <td className="table-cell">
                          {isReturned ? (
                            <span className="badge-red text-[10px]">Qaytarilgan</span>
                          ) : isBoughtBack ? (
                            <span className="badge-blue text-[10px]">Qayta olingan</span>
                          ) : (
                            <span className="badge-green text-[10px]">Sotilgan</span>
                          )}
                        </td>
                        <td className="table-cell text-dark-400 text-xs">{formatDate(s.saleDate)}</td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="bg-dark-50 dark:bg-dark-700/50 font-bold">
                    <td className="table-cell" colSpan={3}>JAMI BRUTTO FOYDA:</td>
                    <td className="table-cell text-emerald-600">{formatCurrency(totalSalesProfit, currency)}</td>
                    <td className="table-cell" colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, phone: null, loading: false })}
        title="Mahsulot ma'lumotlari"
        size="lg"
      >
        {detailModal.loading ? (
          <div className="py-10 flex justify-center"><LoadingSpinner /></div>
        ) : detailModal.phone ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Brand', detailModal.phone.brand],
                ['Model', detailModal.phone.model],
                ['IMEI', detailModal.phone.imei2 ? `${detailModal.phone.imei} / ${detailModal.phone.imei2}` : detailModal.phone.imei],
                ...(detailModal.phone.uzimei ? [['UZIMEI', detailModal.phone.uzimei]] : []),
                ['Holat', detailModal.phone.condition],
                ['Status', detailModal.phone.status],
                ['Rang', detailModal.phone.color || '—'],
                ['Xotira', detailModal.phone.storageSize || '—'],
                ['Karobka', detailModal.phone.hasBox ? 'Bor' : 'Yo\'q'],
                ...(detailModal.phone.batteryHealth != null ? [['🔋 Batareka', `${detailModal.phone.batteryHealth}%`]] : []),
                ...(detailModal.phone.chargeCount != null ? [['🔄 Zaryadlash', detailModal.phone.chargeCount]] : []),
                ['Xarid narxi', formatUZS(detailModal.phone.purchasePriceUZS)],
                ['USD narxi', formatUSD(detailModal.phone.purchasePriceUSD)],
                ['Sana', formatDate(detailModal.phone.createdAt)],
                ...(detailModal.phone.warranty ? [['Kafolat', detailModal.phone.warranty]] : []),
              ].map(([label, value]) => (
                <div key={label} className="bg-dark-50 dark:bg-dark-700 rounded-lg p-3">
                  <p className="text-xs text-dark-400">{label}</p>
                  <p className={`text-sm font-medium mt-0.5 ${
                    label === 'UZIMEI' 
                      ? (String(value).toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                      : 'text-dark-900 dark:text-white'
                  }`}>{value}</p>
                </div>
              ))}
            </div>
            {(detailModal.phone.notes || detailModal.phone.returnReason) && (
              <div className="bg-dark-50 dark:bg-dark-700 rounded-lg p-3">
                <p className="text-xs text-dark-400 mb-1">Izoh / Qaytarish sababi</p>
                <p className="text-sm text-dark-700 dark:text-dark-300">
                  {detailModal.phone.notes}
                  {detailModal.phone.returnReason && <span className="block mt-1 text-red-500">Qaytarish sababi: {detailModal.phone.returnReason}</span>}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center py-10 text-dark-400">Ma'lumot topilmadi</p>
        )}
      </Modal>
    </div>
  );
};

export default ReportsPage;
