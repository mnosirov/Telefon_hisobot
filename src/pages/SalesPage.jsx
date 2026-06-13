import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc,
  serverTimestamp, where, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Plus, Search, ShoppingCart, TrendingUp, RotateCcw, AlertTriangle, Eye, Info, DollarSign, History, Edit2 } from 'lucide-react';
import { formatUZS, formatUSD, formatCurrency, formatDate, formatDateTime, formatTime, getTashkentDateString } from '../utils/helpers';
import { PAYMENT_METHODS } from '../utils/constants';

const schema = z.object({
  phoneId: z.string().min(1, 'Telefon tanlang'),
  buyerName: z.string().min(1, 'Xaridor ismini kiriting'),
  buyerPhone: z.string().optional(),
  saleDate: z.string().min(1, 'Sanani kiriting'),
  salePriceCurrency: z.enum(['UZS', 'USD']),
  salePrice: z.number({ coerce: true }).min(0),
  paymentMethod: z.string().min(1, "To'lov usulini tanlang"),
  isPaid: z.boolean().optional(),
  warranty: z.string().optional(),
  notes: z.string().optional(),
});

const ITEMS_PER_PAGE = 10;

const RETURN_REASONS = [
  'Ekrani singan',
  'Batareya muammosi',
  'Mikrofon/Dinamik ishlamayapti',
  'Kamera muammosi',
  'Dasturiy xato',
  'Korroziya / Nam kirgan',
  "Ishlab chiqaruvchi nuqsoni",
  'Boshqa sabab',
];

const SalesPage = () => {
  const { hasPermission, logAction, currentUser, userProfile, isAdmin } = useAuth();
  const { currency, exchangeRate } = useSettings();
  const shopId = userProfile?.shopId;
  const [sales, setSales] = useState([]);
  const [phones, setPhones] = useState([]);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [showPhoneResults, setShowPhoneResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [usdRate, setUsdRate] = useState(exchangeRate || 12700);
  const [detailModal, setDetailModal] = useState({ open: false, phone: null, loading: false });

  useEffect(() => {
    if (exchangeRate) setUsdRate(exchangeRate);
  }, [exchangeRate]);

  const [returnModal, setReturnModal] = useState({ open: false, sale: null });
  const [returnForm, setReturnForm] = useState({
    type: 'customer',
    reason: '',
    customReason: '',
    newPhoneStatus: 'Nuqsonli',
    refundAmount: '',
    refundCurrency: 'USD',
  });
  const [returning, setReturning] = useState(false);
  const [buybackModal, setBuybackModal] = useState({ open: false, sale: null });
  const [buybackForm, setBuybackForm] = useState({
    price: '',
    currency: 'USD',
    usdRate: exchangeRate || 12700,
    condition: 'Ishlatilgan',
    batteryHealth: '',
    chargeCount: '',
    notes: '',
  });
  const [buyingBack, setBuyingBack] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, sale: null });

  const { register, handleSubmit, reset, watch, formState: { errors }, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      salePriceCurrency: 'USD',
      saleDate: getTashkentDateString(),
      isPaid: true,
    },
  });

  const openAdd = () => {
    reset({
      saleDate: getTashkentDateString(),
      isPaid: true,
      salePriceCurrency: 'USD',
    });
    setPhoneSearch('');
    setModalOpen(true);
  };

  const watchPhone = watch('phoneId');
  const selectedPhone = phones.find((p) => p.id === watchPhone);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowPhoneResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = useCallback(async () => {
    if (!shopId) return;
    try {
      setLoading(true);
      const [salesSnap, phonesSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId))),
      ]);
      const phoneMap = {};
      const phonesData = [];
      phonesSnap.forEach((d) => {
        const p = { id: d.id, ...d.data() };
        phoneMap[d.id] = p;
        if (p.status === 'Sotuvda' && !p.isDeleted && !p.isArchived) phonesData.push(p);
      });
      const salesData = [];
      salesSnap.forEach((d) => {
        const s = { id: d.id, ...d.data() };
        if (s.phoneId && phoneMap[s.phoneId]?.uzimei) {
          s.uzimei = phoneMap[s.phoneId].uzimei;
        }
        salesData.push(s);
      });
      salesData.sort((a, b) => {
        const aTime = a.saleDate?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
        const bTime = b.saleDate?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setSales(salesData);
      setPhones(phonesData);
    } catch {
      toast.error('Yuklanishda xato');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewDetails = async (sale) => {
    setDetailModal({ open: true, phone: null, loading: true });
    try {
      if (sale.phoneId) {
        const phoneDoc = await getDoc(doc(db, 'phones', sale.phoneId));
        if (phoneDoc.exists()) {
          setDetailModal({ open: true, phone: { id: phoneDoc.id, ...phoneDoc.data() }, loading: false });
          return;
        }
      }
      setDetailModal({ open: true, phone: { brand: sale.phoneName?.split(' ')[0], model: sale.phoneName, imei: sale.phoneImei, notes: sale.notes }, loading: false });
    } catch (err) {
      console.error('Error fetching phone details:', err);
      toast.error('Ma\'lumotlarni yuklashda xato');
      setDetailModal({ open: false, phone: null, loading: false });
    }
  };

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);
      const rate = usdRate;
      const salePriceUZS = data.salePriceCurrency === 'USD' ? data.salePrice * rate : data.salePrice;
      const salePriceUSD = data.salePriceCurrency === 'USD' ? data.salePrice : data.salePrice / rate;
      const phone = phones.find((p) => p.id === data.phoneId);
      const profit = salePriceUZS - (phone?.purchasePriceUZS || 0);

      let finalSaleDate = new Date();
      if (data.saleDate) {
        const parsed = new Date(data.saleDate);
        const now = new Date();
        if (!isNaN(parsed.getTime())) {
          parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
          finalSaleDate = parsed;
        }
      }

      const payload = {
        ...data,
        shopId,
        salePriceUZS, salePriceUSD,
        purchasePriceUZS: phone?.purchasePriceUZS || 0,
        purchasePriceUSD: phone?.purchasePriceUSD || 0,
        profit,
        usdRate: rate,
        phoneName: `${phone?.brand} ${phone?.model}${phone?.ram ? ` (${phone.ram})` : ''}`,
        phoneImei: phone?.imei2 ? `${phone.imei} / ${phone.imei2}` : phone?.imei,
        uzimei: phone?.uzimei || "O'tmagan",
        status: 'Sotilgan',
        warranty: data.warranty || '',
        saleDate: finalSaleDate,
        createdAt: serverTimestamp(),
      };

      // Remove undefined values (Firestore doesn't allow them)
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) delete payload[key];
      });

      await addDoc(collection(db, 'sales'), payload);

      if (data.buyerName && data.buyerName.toLowerCase() !== 'nomalum') {
        const existSnap = await getDocs(query(
          collection(db, 'contacts'),
          where('shopId', '==', shopId),
          where('name', '==', data.buyerName),
          where('phone', '==', data.buyerPhone || ''),
          where('type', '==', 'buyer')
        ));
        if (existSnap.empty) {
          await addDoc(collection(db, 'contacts'), {
            name: data.buyerName, phone: data.buyerPhone || '',
            type: 'buyer', shopId, createdAt: serverTimestamp(),
          });
        }
      }

      await updateDoc(doc(db, 'phones', data.phoneId), {
        status: 'Sotilgan', 
        soldAt: finalSaleDate, 
        buyerName: data.buyerName,
        warranty: data.warranty || '',
        isArchived: true,
      });

      await logAction(currentUser.uid, 'sale_created', { phoneId: data.phoneId, buyer: data.buyerName });
      toast.success("Sotuv qo'shildi");
      setModalOpen(false);
      reset();
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (sale) => {
    setEditModal({ open: true, sale });
    reset({
      phoneId: sale.phoneId,
      buyerName: sale.buyerName,
      buyerPhone: sale.buyerPhone || '',
      saleDate: getTashkentDateString(sale.saleDate),
      salePriceCurrency: 'USD',
      salePrice: sale.salePrice,
      paymentMethod: sale.paymentMethod,
      isPaid: sale.isPaid !== undefined ? sale.isPaid : true,
      warranty: sale.warranty || '',
      notes: sale.notes || '',
    });
    setUsdRate(sale.usdRate || exchangeRate || 12700);
    setPhoneSearch(sale.phoneName + (sale.phoneImei ? ` (${sale.phoneImei})` : ''));
  };

  const onEditSubmit = async (data) => {
    try {
      setSubmitting(true);
      const { sale } = editModal;
      const rate = usdRate;
      const salePriceUZS = data.salePriceCurrency === 'USD' ? data.salePrice * rate : data.salePrice;
      const salePriceUSD = data.salePriceCurrency === 'USD' ? data.salePrice : data.salePrice / rate;
      
      const profit = salePriceUZS - (sale.purchasePriceUZS || 0);
      let finalSaleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
      if (data.saleDate) {
        const parsed = new Date(data.saleDate);
        const now = new Date();
        if (!isNaN(parsed.getTime())) {
          const existingTime = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate);
          parsed.setHours(existingTime.getHours(), existingTime.getMinutes(), existingTime.getSeconds(), existingTime.getMilliseconds());
          finalSaleDate = parsed;
        }
      }

      // Fetch the latest phone details to keep UZIMEI, phoneName, and phoneImei fully in sync
      let currentPhoneData = {};
      if (data.phoneId) {
        const phoneDoc = await getDoc(doc(db, 'phones', data.phoneId));
        if (phoneDoc.exists()) {
          currentPhoneData = phoneDoc.data();
        }
      }

      const payload = {
        ...data,
        salePriceUZS, 
        salePriceUSD,
        profit,
        usdRate: rate,
        phoneName: currentPhoneData.brand ? `${currentPhoneData.brand} ${currentPhoneData.model}${currentPhoneData.ram ? ` (${currentPhoneData.ram})` : ''}` : sale.phoneName,
        phoneImei: currentPhoneData.imei ? (currentPhoneData.imei2 ? `${currentPhoneData.imei} / ${currentPhoneData.imei2}` : currentPhoneData.imei) : sale.phoneImei,
        uzimei: currentPhoneData.uzimei || "O'tmagan",
        saleDate: finalSaleDate,
        updatedAt: serverTimestamp(),
      };

      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) delete payload[key];
      });

      await updateDoc(doc(db, 'sales', sale.id), payload);

      if (sale.phoneId) {
        await updateDoc(doc(db, 'phones', sale.phoneId), {
          buyerName: data.buyerName,
          soldAt: finalSaleDate,
          warranty: data.warranty || '',
        });
      }

      await logAction(currentUser.uid, 'sale_updated', { saleId: sale.id, buyer: data.buyerName });
      toast.success("Sotuv ma'lumotlari yangilandi");
      setEditModal({ open: false, sale: null });
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const openReturn = (sale) => {
    setReturnForm({
      type: 'customer',
      reason: '',
      customReason: '',
      newPhoneStatus: 'Nuqsonli',
      refundAmount: sale.salePriceUSD || '',
      refundCurrency: 'USD',
    });
    setReturnModal({ open: true, sale });
  };

  const handleReturn = async () => {
    const finalReason = returnForm.reason === 'Boshqa sabab'
      ? returnForm.customReason
      : returnForm.reason;

    if (!finalReason.trim()) {
      toast.error('Qaytarish sababini kiriting');
      return;
    }

    try {
      setReturning(true);
      const { sale } = returnModal;

      const refundAmt = Number(returnForm.refundAmount) || 0;
      const refundUSD = refundAmt;
      const refundUZS = refundAmt * (usdRate || exchangeRate || 12700);

      await addDoc(collection(db, 'returns'), {
        shopId,
        saleId: sale.id,
        phoneId: sale.phoneId,
        phoneName: sale.phoneName,
        phoneImei: sale.phoneImei,
        buyerName: sale.buyerName,
        returnType: returnForm.type,
        reason: finalReason,
        newPhoneStatus: returnForm.newPhoneStatus,
        refundAmount: refundUZS,
        refundAmountUSD: refundUSD,
        refundAmountUZS: refundUZS,
        refundCurrency: 'USD',
        usdRate,
        returnedAt: serverTimestamp(),
        returnedBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'sales', sale.id), {
        status: 'Qaytarilgan',
        returnReason: finalReason,
        returnedAt: serverTimestamp(),
        refundAmountUSD: refundUSD,
        refundAmountUZS: refundUZS,
        refundCurrency: 'USD',
      });

      if (sale.phoneId) {
        await updateDoc(doc(db, 'phones', sale.phoneId), {
          status: returnForm.newPhoneStatus,
          returnReason: finalReason,
          returnedAt: serverTimestamp(),
          isArchived: returnForm.newPhoneStatus === 'Sotilgan' || returnForm.newPhoneStatus === 'Qaytarilgan',
        });
      }

      await logAction(currentUser.uid, 'sale_returned', {
        saleId: sale.id,
        reason: finalReason,
        type: returnForm.type,
      });

      toast.success('Qaytarish qayd etildi');
      setReturnModal({ open: false, sale: null });
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setReturning(false);
    }
  };

  const openBuyback = (sale) => {
    setBuybackForm({
      price: '',
      currency: 'USD',
      usdRate: exchangeRate || 12700,
      condition: 'Ishlatilgan',
      batteryHealth: sale.batteryHealth || '',
      chargeCount: sale.chargeCount || '',
      notes: `Qayta sotib olindi. Oldingi xaridor: ${sale.buyerName}`,
    });
    setBuybackModal({ open: true, sale });
  };

  const handleBuyback = async () => {
    if (!buybackForm.price) {
      toast.error('Sotib olish narxini kiriting');
      return;
    }

    try {
      setBuyingBack(true);
      const { sale } = buybackModal;
      const rate = Number(buybackForm.usdRate) || 12700;
      
      const buyPrice = Number(buybackForm.price);
      const buyPriceUSD = buybackForm.currency === 'USD' ? buyPrice : buyPrice / rate;
      const buyPriceUZS = buybackForm.currency === 'UZS' ? buyPrice : buyPrice * rate;

      // Fetch original phone data to copy all fields (color, storage, hasBox, etc.)
      let originalPhoneData = {};
      if (sale.phoneId) {
        const phoneDoc = await getDoc(doc(db, 'phones', sale.phoneId));
        if (phoneDoc.exists()) {
          originalPhoneData = phoneDoc.data();
        }
      }

      // Create new phone record by merging original data with new buyback info
      const phoneData = {
        ...originalPhoneData, // Copy all fields: color, storageSize, hasBox, uzimei, brand, model, etc.
        condition: buybackForm.condition,
        purchasePrice: buyPrice,
        purchasePriceUSD: buyPriceUSD,
        purchasePriceUZS: buyPriceUZS,
        usdRate: rate,
        batteryHealth: buybackForm.batteryHealth ? Number(buybackForm.batteryHealth) : null,
        chargeCount: buybackForm.chargeCount ? Number(buybackForm.chargeCount) : null,
        status: 'Sotuvda',
        shopId,
        purchaseDate: new Date().toISOString().split('T')[0],
        notes: buybackForm.notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isArchived: false,
        isDeleted: false,
        parentSaleId: sale.id,
        isBuyback: true,
        // Ensure these are correct if originalPhoneData was missing them
        brand: originalPhoneData.brand || sale.phoneName?.split(' ')[0] || '',
        model: originalPhoneData.model || sale.phoneName?.split(' ').slice(1).join(' ') || sale.phoneName,
        imei: originalPhoneData.imei || sale.phoneImei?.split(' / ')[0] || sale.phoneImei,
        imei2: originalPhoneData.imei2 || sale.phoneImei?.split(' / ')[1] || '',
      };

      // Remove any unwanted fields from original data that shouldn't be in new record
      delete phoneData.id;
      delete phoneData.soldAt;
      delete phoneData.buyerName;
      delete phoneData.buyerPhone;

      await addDoc(collection(db, 'phones'), phoneData);

      // Update original sale status
      await updateDoc(doc(db, 'sales', sale.id), {
        status: 'Qayta sotib olingan',
        buybackPriceUSD: buyPriceUSD,
        buybackPriceUZS: buyPriceUZS,
        boughtBackAt: serverTimestamp(),
      });
      
      await logAction(currentUser.uid, 'phone_buyback', { 
        saleId: sale.id, 
        model: sale.phoneName, 
        price: buyPrice 
      });

      toast.success('Telefon qayta sotib olindi va sotuvga qo\'shildi');
      setBuybackModal({ open: false, sale: null });
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setBuyingBack(false);
    }
  };

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    return !q || [s.buyerName, s.phoneName, s.phoneImei].some((f) => f?.toLowerCase().includes(q));
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalRevenue = sales.reduce((a, s) => {
    const isReturned = s.status === 'Qaytarilgan';
    const sPrice = currency === 'USD' ? (s.salePriceUSD || 0) : (s.salePriceUZS || 0);
    
    if (isReturned) {
      if (s.refundAmountUZS !== undefined) {
        const rAmount = currency === 'USD' ? (s.refundAmountUSD || (s.refundAmountUZS / 12700)) : (s.refundAmountUZS || 0);
        return a + (sPrice - rAmount); // Qaytarishdan qolgan sof foyda/savdo
      }
      return a; // refundAmount yo'q bo'lsa, bu sotuv savdoga qo'shilmaydi
    }
    
    return a + sPrice;
  }, 0);

  const totalProfit = sales.reduce((a, s) => {
    const isReturned = s.status === 'Qaytarilgan';
    const sPrice = currency === 'USD' ? (s.salePriceUSD || 0) : (s.salePriceUZS || 0);
    
    if (isReturned) {
      if (s.refundAmountUZS !== undefined) {
        const rAmount = currency === 'USD' ? (s.refundAmountUSD || (s.refundAmountUZS / 12700)) : (s.refundAmountUZS || 0);
        return a + (sPrice - rAmount);
      }
      return a; // refundAmount yo'q bo'lsa, foyda ham 0
    }
    
    const pPrice = currency === 'USD' 
      ? (s.purchasePriceUSD || (s.purchasePriceUZS ? s.purchasePriceUZS / 12700 : 0))
      : (s.purchasePriceUZS || 0);
    
    return a + (sPrice - pPrice);
  }, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Sotuvlar</h1>
          <p className="text-sm text-dark-400">{sales.length} ta sotuv</p>
        </div>
        {hasPermission('create_sales') && (
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Sotuv qo'shish
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Jami sotuvlar</p>
            <p className="text-xl font-bold text-dark-900 dark:text-white">{sales.filter(s => s.status !== 'Qaytarilgan').length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Jami savdo</p>
            <p className="text-lg font-bold text-dark-900 dark:text-white">{formatCurrency(totalRevenue, currency)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Jami foyda</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalProfit, currency)}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Xaridor, telefon yoki IMEI..." className="input pl-9" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-50 dark:bg-dark-700/50">
              <tr>
                <th className="table-header">Xaridor</th>
                <th className="table-header">Telefon</th>
                <th className="table-header">To'lov</th>
                <th className="table-header">Narx</th>
                <th className="table-header">Foyda</th>
                <th className="table-header">Sana</th>
                <th className="table-header">Holat</th>
                {hasPermission('create_sales') && <th className="table-header"></th>}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-dark-400">Sotuv topilmadi</td></tr>
              ) : (
                paginated.map((sale) => {
                  const isReturned = sale.status === 'Qaytarilgan';
                  const isBoughtBack = sale.status === 'Qayta sotib olingan';
                  const isInactive = isReturned || isBoughtBack;
                  return (
                    <tr key={sale.id} className={`table-row ${isInactive ? 'opacity-60' : ''}`}>
                      <td className="table-cell">
                        <p className={`font-medium ${isInactive ? 'line-through text-dark-400' : 'text-dark-900 dark:text-white'}`}>{sale.buyerName}</p>
                        <p className="text-xs text-dark-400">{sale.buyerPhone}</p>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-col items-start gap-1">
                          <p>{sale.phoneName}</p>
                          <p className={`text-xs font-mono ${sale.uzimei?.toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400 font-bold' : sale.uzimei?.toLowerCase().includes("o'tmagan") ? 'text-red-500 dark:text-red-400' : 'text-dark-400'}`}>
                            {sale.phoneImei}
                          </p>
                          {sale.uzimei && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded w-max ${
                              sale.uzimei.toLowerCase().includes("o'tgan") ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              UZIMEI: {sale.uzimei}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell"><span className="badge-blue">{sale.paymentMethod}</span></td>
                      <td className="table-cell font-semibold text-green-600 dark:text-green-400 text-sm">
                        <div className="flex flex-col">
                          <span>{formatCurrency(currency === 'USD' ? sale.salePriceUSD : sale.salePriceUZS, currency)}</span>
                          <span className="text-[10px] text-dark-400 font-normal">
                            {currency === 'USD' ? formatUZS(sale.salePriceUZS) : formatUSD(sale.salePriceUSD)}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                        <div className="flex flex-col">
                          <span>
                            {(() => {
                              const sPrice = currency === 'USD' ? (sale.salePriceUSD || 0) : (sale.salePriceUZS || 0);
                              const pPrice = currency === 'USD' 
                                ? (sale.purchasePriceUSD || (sale.purchasePriceUZS ? sale.purchasePriceUZS / 12700 : 0))
                                : (sale.purchasePriceUZS || 0);
                              return formatCurrency(sPrice - pPrice, currency);
                            })()}
                          </span>
                          <span className="text-[10px] text-dark-400 font-normal">
                            {currency === 'USD' 
                              ? formatUZS(sale.profit) 
                              : formatUSD(sale.salePriceUSD - (sale.purchasePriceUSD || (sale.purchasePriceUZS ? sale.purchasePriceUZS / 12700 : 0)))}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell text-dark-400">
                        <div className="flex flex-col">
                          <span className="text-dark-900 dark:text-white font-medium">{formatDate(sale.saleDate)}</span>
                          <span className="text-xs text-dark-400">
                            {formatTime(sale.saleDate)}
                          </span>
                          {sale.warranty && (
                            <span className="text-[10px] text-blue-500 font-medium mt-0.5">Kafolat: {sale.warranty}</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        {isReturned ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">
                            <RotateCcw className="w-3 h-3" /> Qaytarilgan
                          </span>
                        ) : isBoughtBack ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                            <DollarSign className="w-3 h-3" /> Qayta olingan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Sotilgan
                          </span>
                        )}
                      </td>
                      {hasPermission('create_sales') && (
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewDetails(sale)}
                              className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-500 transition-colors"
                              title="Tafsilotlar"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEdit(sale)}
                              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 transition-colors"
                              title="Tahrirlash"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {!isInactive && (
                              <>
                                <button
                                  onClick={() => openReturn(sale)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                                  title="Qaytarish (Ayb/Voz kechish)"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openBuyback(sale)}
                                  className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"
                                  title="Qayta sotib olish (Buyback)"
                                >
                                  <DollarSign className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Yangi sotuv" size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="relative" ref={searchRef}>
            <label className="label">Telefon *</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Qidiruv (IMEI oxirgi 4 raqami, brand yoki model)..."
                className="input pr-10"
                value={phoneSearch}
                onChange={(e) => {
                  setPhoneSearch(e.target.value);
                  setShowPhoneResults(true);
                  if (!e.target.value) setValue('phoneId', '');
                }}
                onFocus={() => setShowPhoneResults(true)}
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            </div>
            
            {showPhoneResults && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {phones.filter(p => {
                  const q = phoneSearch.toLowerCase();
                  if (!q) return true;
                  const last4_1 = p.imei?.slice(-4);
                  const last4_2 = p.imei2?.slice(-4);
                  if (q.length === 4 && (last4_1 === q || last4_2 === q)) return true;
                  
                  return p.brand?.toLowerCase().includes(q) || 
                         p.model?.toLowerCase().includes(q) || 
                         p.imei?.toLowerCase().includes(q) ||
                         p.imei2?.toLowerCase().includes(q);
                }).length === 0 ? (
                  <div className="p-3 text-center text-dark-400 text-sm">Telefon topilmadi</div>
                ) : (
                  phones.filter(p => {
                    const q = phoneSearch.toLowerCase();
                    if (!q) return true;
                    const last4_1 = p.imei?.slice(-4);
                    const last4_2 = p.imei2?.slice(-4);
                    if (q.length === 4 && (last4_1 === q || last4_2 === q)) return true;
                    return p.brand?.toLowerCase().includes(q) || 
                           p.model?.toLowerCase().includes(q) || 
                           p.imei?.toLowerCase().includes(q) ||
                           p.imei2?.toLowerCase().includes(q);
                  }).map(p => (
                    <div
                      key={p.id}
                      className="p-3 hover:bg-dark-50 dark:hover:bg-dark-700 cursor-pointer border-b border-dark-100 dark:border-dark-700 last:border-0"
                      onClick={() => {
                        setValue('phoneId', p.id);
                        setPhoneSearch(`${p.brand} ${p.model}${p.ram ? ` (${p.ram})` : ''} (${p.imei || "IMEI yo'q"})`);
                        setShowPhoneResults(false);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-dark-900 dark:text-white">{p.brand} {p.model} {p.ram ? `(${p.ram})` : ''}</p>
                          <p className="text-xs text-dark-400 font-mono">IMEI: {p.imei || "yo'q"} {p.imei2 ? `/ ${p.imei2}` : ''}</p>
                        </div>
                        <div className="text-right">
                          {isAdmin() && <p className="text-xs font-bold text-primary-500">{formatUSD(p.purchasePriceUSD)}</p>}
                          <p className="text-[10px] text-dark-400">{p.condition}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            <input type="hidden" {...register('phoneId')} />
            {errors.phoneId && <p className="text-red-500 text-xs mt-1">Telefonni tanlang</p>}
            
            {selectedPhone && isAdmin() && (
              <div className="mt-2 p-2 bg-primary-50 dark:bg-primary-950/20 rounded-lg border border-primary-100 dark:border-primary-900/30 flex items-center gap-2">
                <Info className="w-4 h-4 text-primary-600" />
                <p className="text-xs text-primary-700 dark:text-primary-300">
                  Xarid narxi: <span className="font-bold">{formatCurrency(currency === 'USD' ? selectedPhone.purchasePriceUSD : selectedPhone.purchasePriceUZS, currency)}</span>
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Xaridor ismi *</label>
              <input {...register('buyerName')} className="input" placeholder="Ism Familiya" />
              {errors.buyerName && <p className="text-red-500 text-xs mt-1">{errors.buyerName.message}</p>}
            </div>
            <div>
              <label className="label">Tel. raqam</label>
              <input {...register('buyerPhone')} className="input" placeholder="+998..." />
            </div>
          </div>
          <input type="hidden" {...register('salePriceCurrency')} value="USD" />
          <div>
            <label className="label">Sotuv narxi (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold">$</span>
              <input {...register('salePrice', { valueAsNumber: true })} type="number" className="input pl-7" placeholder="0.00" step="0.01" />
            </div>
            {errors.salePrice && <p className="text-red-500 text-xs mt-1">{errors.salePrice.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">To'lov usuli *</label>
              <select {...register('paymentMethod')} className="input">
                <option value="">Tanlang</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sotuv sanasi</label>
              <input {...register('saleDate')} type="date" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input {...register('isPaid')} type="checkbox" id="isPaid" className="w-4 h-4 accent-primary-600" />
              <label htmlFor="isPaid" className="text-sm text-dark-700 dark:text-dark-300">To'liq to'langan</label>
            </div>
            <div>
              <label className="label">Kafolat (ixtiyoriy)</label>
              <input {...register('warranty')} className="input" placeholder="Masalan: 1 oy, 1 yil" />
            </div>
          </div>
          <div>
            <label className="label">Izoh</label>
            <textarea {...register('notes')} className="input" rows={2} />
          </div>

          {/* Dynamic Rate in Sale Modal */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">💱 Sotuv kursi:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={usdRate}
                  onChange={(e) => setUsdRate(Number(e.target.value) || 12700)}
                  className="w-28 px-2 py-1 bg-white dark:bg-dark-800 border border-blue-300 dark:border-blue-700 rounded-lg text-sm font-mono text-dark-900 dark:text-white focus:outline-none"
                />
                <span className="text-xs text-blue-500">so'm</span>
              </div>
            </div>
            <p className="text-[10px] text-blue-500 mt-1">Sotuv narxi va foyda ushbu kurs bo'yicha hisoblanadi</p>
          </div>

          {selectedPhone && watch('salePrice') > 0 && isAdmin() && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                Taxminiy foyda: {formatUZS(
                  (watch('salePriceCurrency') === 'USD' ? watch('salePrice') * usdRate : watch('salePrice')) -
                  (selectedPhone?.purchasePriceUZS || 0)
                )}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Qaytarish modali */}
      <Modal isOpen={returnModal.open} onClose={() => setReturnModal({ open: false, sale: null })} title="Telefon qaytarish" size="md">
        {returnModal.sale && (
          <div className="space-y-4">
            {/* Telefon info */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">{returnModal.sale.phoneName}</p>
                <p className="text-xs text-red-500 font-mono">{returnModal.sale.phoneImei}</p>
                <p className="text-xs text-red-500 mt-1">Xaridor: {returnModal.sale.buyerName}</p>
              </div>
            </div>

            {/* Qaytarish turi */}
            <div>
              <label className="label">Qaytarish turi *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReturnForm({ ...returnForm, type: 'customer' })}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${returnForm.type === 'customer' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-dark-200 dark:border-dark-600 text-dark-600 dark:text-dark-400'}`}
                >
                  👤 Mijoz qaytardi
                </button>
                <button
                  type="button"
                  onClick={() => setReturnForm({ ...returnForm, type: 'supplier' })}
                  className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${returnForm.type === 'supplier' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' : 'border-dark-200 dark:border-dark-600 text-dark-600 dark:text-dark-400'}`}
                >
                  🏭 Yetkazib beruvchiga
                </button>
              </div>
            </div>

            {/* Sabab */}
            <div>
              <label className="label">Qaytarish sababi *</label>
              <select
                value={returnForm.reason}
                onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value, customReason: '' })}
                className="input"
              >
                <option value="">Tanlang...</option>
                {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {returnForm.reason === 'Boshqa sabab' && (
              <div>
                <label className="label">Izoh (batafsil) *</label>
                <textarea
                  value={returnForm.customReason}
                  onChange={(e) => setReturnForm({ ...returnForm, customReason: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Qaytarish sababini batafsil yozing..."
                />
              </div>
            )}

            {/* Telefon yangi holati */}
            <div>
              <label className="label">Telefonning yangi holati</label>
              <select
                value={returnForm.newPhoneStatus}
                onChange={(e) => setReturnForm({ ...returnForm, newPhoneStatus: e.target.value })}
                className="input"
              >
                <option value="Nuqsonli">Nuqsonli</option>
                <option value="Ta'mirda">Ta'mirda</option>
                <option value="Sotuvda">Sotuvda (sifatli qaytdi)</option>
                <option value="Qaytarilgan">Qaytarilgan (hisobdan chiqarildi)</option>
              </select>
            </div>

            {/* Qaytarilgan summa */}
            <div>
              <label className="label">Qaytarilgan summa (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold">$</span>
                <input
                  type="number"
                  value={returnForm.refundAmount}
                  onChange={(e) => setReturnForm({ ...returnForm, refundAmount: e.target.value, refundCurrency: 'USD' })}
                  className="input pl-7"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <p className="text-xs text-dark-400 mt-1">
                Sotuv narxi: <span className="font-medium">{formatUSD(returnModal.sale.salePriceUSD)}</span>
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setReturnModal({ open: false, sale: null })} className="btn-secondary">Bekor qilish</button>
              <button
                onClick={handleReturn}
                disabled={returning}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                {returning ? 'Qayd etilmoqda...' : 'Qaytarishni tasdiqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, phone: null, loading: false })}
        title="Sotilgan telefon ma'lumotlari"
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
                ['Sotuvchi', detailModal.phone.buyerName || '—'],
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

      {/* Qayta sotib olish (Buyback) modali */}
      <Modal isOpen={buybackModal.open} onClose={() => setBuybackModal({ open: false, sale: null })} title="Qayta sotib olish (Buyback)" size="md">
        {buybackModal.sale && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-700 dark:text-blue-400">{buybackModal.sale.phoneName}</p>
                <p className="text-xs text-blue-500 font-mono">{buybackModal.sale.phoneImei}</p>
                <p className="text-xs text-blue-500 mt-1">Sotilgan narxi: {formatCurrency(buybackModal.sale.salePriceUSD || buybackModal.sale.salePriceUZS, buybackModal.sale.salePriceUSD ? 'USD' : 'UZS')}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/50 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <RotateCcw className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block">Dollar kursi</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={buybackForm.usdRate}
                      onChange={(e) => setBuybackForm({ ...buybackForm, usdRate: e.target.value })}
                      className="bg-transparent border-b border-slate-700 focus:border-blue-500 outline-none text-sm w-20 py-0.5"
                    />
                    <span className="text-xs text-slate-500">so'm</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Qayta sotib olish narxi (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-bold">$</span>
                  <input
                    type="number"
                    value={buybackForm.price}
                    onChange={(e) => setBuybackForm({ ...buybackForm, price: e.target.value, currency: 'USD' })}
                    className="input pl-8"
                    placeholder="0.00"
                    step="0.01"
                    required
                  />
                </div>
              </div>

            </div>

            <div>
              <label className="label">Telefon holati</label>
              <select
                value={buybackForm.condition}
                onChange={(e) => setBuybackForm({ ...buybackForm, condition: e.target.value })}
                className="input"
              >
                <option value="Ishlatilgan">Ishlatilgan</option>
                <option value="Yangi">Yangi</option>
                <option value="Ideal">Ideal</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Batareka (%)</label>
                <input
                  type="number"
                  value={buybackForm.batteryHealth}
                  onChange={(e) => setBuybackForm({ ...buybackForm, batteryHealth: e.target.value })}
                  className="input"
                  placeholder="Masalan: 88"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="label">Zaryadlash soni</label>
                <input
                  type="number"
                  value={buybackForm.chargeCount}
                  onChange={(e) => setBuybackForm({ ...buybackForm, chargeCount: e.target.value })}
                  className="input"
                  placeholder="Masalan: 250"
                  min="0"
                />
              </div>
            </div>

            <div>
              <label className="label">Izoh</label>
              <textarea
                value={buybackForm.notes}
                onChange={(e) => setBuybackForm({ ...buybackForm, notes: e.target.value })}
                className="input"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setBuybackModal({ open: false, sale: null })} className="btn-secondary">Bekor qilish</button>
              <button
                onClick={handleBuyback}
                disabled={buyingBack}
                className="btn-primary"
              >
                {buyingBack ? 'Saqlanmoqda...' : 'Sotib olish va Sotuvga qo\'shish'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Tahrirlash modali */}
      <Modal isOpen={editModal.open} onClose={() => setEditModal({ open: false, sale: null })} title="Sotuvni tahrirlash" size="lg">
        <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-3 mb-4">
            <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">Diqqat!</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Sotuv ma'lumotlarini o'zgartirish umumiy hisobotlarga ta'sir qiladi.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Xaridor ismi *</label>
              <input {...register('buyerName')} className="input" placeholder="Ism Familiya" />
              {errors.buyerName && <p className="text-red-500 text-xs mt-1">{errors.buyerName.message}</p>}
            </div>
            <div>
              <label className="label">Tel. raqam</label>
              <input {...register('buyerPhone')} className="input" placeholder="+998..." />
            </div>
          </div>
          <input type="hidden" {...register('salePriceCurrency')} value="USD" />
          <div>
            <label className="label">Sotuv narxi (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold">$</span>
              <input {...register('salePrice', { valueAsNumber: true })} type="number" className="input pl-7" placeholder="0.00" step="0.01" />
            </div>
            {errors.salePrice && <p className="text-red-500 text-xs mt-1">{errors.salePrice.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">To'lov usuli *</label>
              <select {...register('paymentMethod')} className="input">
                <option value="">Tanlang</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sotuv sanasi</label>
              <input {...register('saleDate')} type="date" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <input {...register('isPaid')} type="checkbox" id="isPaidEdit" className="w-4 h-4 accent-primary-600" />
              <label htmlFor="isPaidEdit" className="text-sm text-dark-700 dark:text-dark-300">To'liq to'langan</label>
            </div>
            <div>
              <label className="label">Kafolat (ixtiyoriy)</label>
              <input {...register('warranty')} className="input" placeholder="Masalan: 1 oy, 1 yil" />
            </div>
          </div>
          <div>
            <label className="label">Izoh</label>
            <textarea {...register('notes')} className="input" rows={2} />
          </div>

          {/* Dynamic Rate in Edit Modal */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">💱 Sotuv kursi:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={usdRate}
                  onChange={(e) => setUsdRate(Number(e.target.value) || 12700)}
                  className="w-28 px-2 py-1 bg-white dark:bg-dark-800 border border-blue-300 dark:border-blue-700 rounded-lg text-sm font-mono text-dark-900 dark:text-white focus:outline-none"
                />
                <span className="text-xs text-blue-500">so'm</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setEditModal({ open: false, sale: null })} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saqlanmoqda...' : 'O\'zgarishlarni saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SalesPage;
