import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadMultipleToCloudinary } from '../utils/cloudinary';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ImportModal from '../components/phones/ImportModal';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  Plus, Search, Filter, Edit2, Trash2, Eye,
  Smartphone, Upload, X, SortAsc, SortDesc, Download,
  Archive, ArchiveRestore, DollarSign, TrendingUp, Users, RotateCcw,
} from 'lucide-react';
import {
  formatUZS, formatUSD, getStatusBadge, getConditionBadge,
  validateIMEI, formatDate, formatCurrency, formatTime, getTashkentDateString,
} from '../utils/helpers';
import { exportToCSV, formatExportDate } from '../utils/exportCSV';
import {
  BRANDS, CONDITIONS, PHONE_STATUSES, CURRENCIES, STORAGE_OPTIONS, RAM_OPTIONS,
} from '../utils/constants';

const schema = z.object({
  brand: z.string().min(1, 'Brand tanlang'),
  model: z.string().min(1, 'Model kiriting'),
  imei: z.string().optional(),
  imei2: z.string().optional().refine(val => !val || (val.replace(/\D/g, '').length === 15), { message: 'IMEI 15 ta raqam bo\'lishi kerak' }),
  condition: z.string().min(1, 'Holat tanlang'),
  color: z.string().optional(),
  storageSize: z.string().optional(),
  batteryHealth: z.preprocess((val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? undefined : Number(val)), z.number().min(0).max(100).optional()),
  chargeCount: z.preprocess((val) => (val === '' || val === null || val === undefined || isNaN(Number(val)) ? undefined : Number(val)), z.number().min(0).optional()),
  purchasePrice: z.number({ coerce: true }).min(0, 'Narx kiriting'),
  status: z.string().min(1, 'Status tanlang'),
  supplierName: z.string().optional(),
  supplierPhone: z.string().optional(),
  notes: z.string().optional(),
  hasBox: z.boolean().default(true),
  uzimei: z.string().optional(),
  ram: z.string().optional(),
  purchaseDate: z.string().min(1, 'Sanani kiriting'),
});

const ITEMS_PER_PAGE = 10;

const PhonesPage = () => {
  const { hasPermission, logAction, currentUser, userProfile } = useAuth();
  const { brands, colors, currency, exchangeRate } = useSettings();
  const shopId = userProfile?.shopId;
  const [phones, setPhones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [editingPhone, setEditingPhone] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('purchaseDate');
  const [sortDir, setSortDir] = useState('desc');
  const [lightbox, setLightbox] = useState({ open: false, urls: [], index: 0 });
  const [usdRate, setUsdRate] = useState(exchangeRate || 12700);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  useEffect(() => {
    if (exchangeRate) setUsdRate(exchangeRate);
  }, [exchangeRate]);

  useEffect(() => {
    if (selectedPhone) {
      const updated = phones.find(p => p.id === selectedPhone.id);
      if (updated) setSelectedPhone(updated);
    }
  }, [phones]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCondition, setFilterCondition] = useState('');

  const {
    register, handleSubmit, reset, formState: { errors }, setValue, watch,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'Sotuvda',
      condition: 'Yangi',
      hasBox: true,
      purchaseDate: getTashkentDateString(),
    },
  });

  const watchedBrand = watch('brand');
  const isWifiTablet = watchedBrand?.trim().replace(/\s+/g, ' ').toLowerCase() === 'wifi planshet';

  const fetchPhones = useCallback(async () => {
    if (!shopId) return;
    try {
      const q = query(
        collection(db, 'phones'),
        where('shopId', '==', shopId)
      );
      const snap = await getDocs(q);
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      // JavaScript tomon saralash (indeks talab qilmaydi)
      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setPhones(data);
    } catch (err) {
      toast.error('Telefonlarni yuklashda xato');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  const fetchSuppliers = useCallback(async () => {
    if (!shopId) return;
    try {
      const q = query(
        collection(db, 'contacts'),
        where('shopId', '==', shopId),
        where('type', '==', 'supplier')
      );
      const snap = await getDocs(q);
      const contactSuppliers = [];
      snap.forEach((d) => contactSuppliers.push({ id: d.id, ...d.data() }));

      // Tarixiy ma'lumotlarni ham qo'shish (agar kontaktlarda yo'q bo'lsa)
      const seen = new Set(contactSuppliers.map(s => s.name?.toLowerCase().trim()));
      const historicalSuppliers = [];
      
      phones.forEach(p => {
        const name = p.supplierName?.trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          historicalSuppliers.push({
            id: `old-${p.id}`,
            name: name,
            phone: p.supplierPhone || '',
            createdAt: p.createdAt
          });
        }
      });

      const all = [...contactSuppliers, ...historicalSuppliers];
      all.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setSuppliers(all);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
    }
  }, [shopId, phones]);

  useEffect(() => { 
    fetchPhones(); 
    fetchSuppliers();
  }, [fetchPhones, fetchSuppliers]);

  // Filter & search
  const filtered = phones.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [p.brand, p.model, p.imei, p.imei2, p.supplierName].some(
      (f) => f?.toLowerCase().includes(q)
    );
    const matchBrand = !filterBrand || p.brand === filterBrand;
    const matchStatus = !filterStatus || p.status === filterStatus;
    const matchCondition = !filterCondition || p.condition === filterCondition;
    const matchArchived = showArchived ? p.isArchived === true : !p.isArchived;
    return !p.isDeleted && matchSearch && matchBrand && matchStatus && matchCondition && matchArchived;
  });

  const totalPurchasePriceUSD = filtered.reduce((sum, p) => sum + (p.purchasePriceUSD || 0), 0);
  const totalPurchasePriceUZS = filtered.reduce((sum, p) => sum + (p.purchasePriceUZS || 0), 0);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    const mult = sortDir === 'asc' ? 1 : -1;
    if (typeof aVal === 'number') return (aVal - bVal) * mult;
    return String(aVal).localeCompare(String(bVal)) * mult;
  });

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <SortAsc className="w-3 h-3 text-dark-300" />;
    return sortDir === 'asc'
      ? <SortAsc className="w-3 h-3 text-primary-500" />
      : <SortDesc className="w-3 h-3 text-primary-500" />;
  };

  const openAdd = () => {
    setEditingPhone(null);
    reset({
      brand: '', model: '', imei: '', imei2: '', condition: 'Yangi', color: '', storageSize: '', ram: '',
      batteryHealth: '', chargeCount: '', purchasePrice: '', status: 'Sotuvda',
      supplierName: '', supplierPhone: '', notes: '', hasBox: true,
      purchaseDate: getTashkentDateString(),
    });
    setImageFiles([]);
    setModalOpen(true);
  };

  const openEdit = (phone) => {
    setEditingPhone(phone);
    reset({
      brand: phone.brand,
      model: phone.model,
      imei: phone.imei,
      imei2: phone.imei2 || '',
      condition: phone.condition,
      color: phone.color || '',
      storageSize: phone.storageSize || '',
      batteryHealth: phone.batteryHealth ?? '',
      purchasePrice: phone.purchasePrice ?? (currency === 'USD' ? (phone.purchasePriceUSD || (phone.purchasePriceUZS / (phone.usdRate || exchangeRate || 12700))) : (phone.purchasePriceUZS || (phone.purchasePriceUSD * (phone.usdRate || exchangeRate || 12700)))),
      status: phone.status,
      supplierName: phone.supplierName || '',
      supplierPhone: phone.supplierPhone || '',
      notes: phone.notes || '',
      chargeCount: phone.chargeCount ?? '',
      hasBox: phone.hasBox ?? true,
      ram: phone.ram || '',
      purchaseDate: phone.purchaseDate || getTashkentDateString(phone.createdAt || new Date()),
    });
    setImageFiles([]);
    setModalOpen(true);
  };

  const uploadImages = async () => {
    if (imageFiles.length === 0) return [];
    return uploadMultipleToCloudinary(imageFiles, 'phones');
  };

  const onSubmit = async (data) => {
    // Clean IMEI strings (remove spaces, dashes, etc.)
    const cleanedImei = data.imei?.replace(/\D/g, '') || '';
    const cleanedImei2 = data.imei2?.replace(/\D/g, '') || '';

    const checkWifiTablet = (brand) => brand?.trim().replace(/\s+/g, ' ').toLowerCase() === 'wifi planshet';
    const isWifiTabletData = checkWifiTablet(data.brand);
    
    if (!isWifiTabletData) {
      if (!validateIMEI(cleanedImei)) {
        toast.error('IMEI 1 noto\'g\'ri formatda yoki xato');
        return;
      }
    } else if (cleanedImei && !validateIMEI(cleanedImei)) {
      // If it's a Wifi tablet and IMEI is provided, still validate it?
      // Some users might enter serial number in IMEI field, but let's stick to Luhn if it looks like IMEI
      toast.error('IMEI 1 noto\'g\'ri formatda yoki xato');
      return;
    }

    if (cleanedImei2 && !validateIMEI(cleanedImei2)) {
      toast.error('IMEI 2 noto\'g\'ri formatda yoki xato');
      return;
    }

    // Check for duplicate IMEI
    if (cleanedImei) {
      // Allow duplicate IMEI if all existing ones are sold
      const isDuplicate = phones.find(p => 
        p.imei === cleanedImei && 
        p.id !== editingPhone?.id && 
        p.status !== 'Sotilgan' && 
        !p.isDeleted
      );
      if (isDuplicate) {
        toast.error('Ushbu IMEI bazada (sotuvda) mavjud!');
        return;
      }
    }

    try {
      setUploadingImages(true);
      
      const rate = usdRate;
      const purchasePriceUSD = Number(data.purchasePrice) || 0;
      const purchasePriceUZS = purchasePriceUSD * rate;

      const payload = {
        ...data,
        imei: cleanedImei,
        imei2: cleanedImei2,
        shopId,
        purchasePriceUZS,
        purchasePriceUSD,
        usdRate: rate,
        updatedAt: serverTimestamp(),
      };

      // Remove undefined values (Firestore doesn't allow them)
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) delete payload[key];
      });

      if (editingPhone) {
        let newUrls = editingPhone.imageUrls || [];
        if (imageFiles.length > 0) {
          const uploaded = await uploadImages();
          newUrls = [...newUrls, ...uploaded].slice(0, 5);
        }
        payload.imageUrls = newUrls;
        await updateDoc(doc(db, 'phones', editingPhone.id), payload);

        // Update corresponding sales if exist to keep UZIMEI, name, and IMEI synchronized
        try {
          const salesQuery = query(collection(db, 'sales'), where('phoneId', '==', editingPhone.id));
          const salesSnap = await getDocs(salesQuery);
          if (!salesSnap.empty) {
            const updatePromises = salesSnap.docs.map((docSnap) => {
              return updateDoc(doc(db, 'sales', docSnap.id), {
                uzimei: payload.uzimei || "O'tmagan",
                phoneName: `${payload.brand} ${payload.model}${payload.ram ? ` (${payload.ram})` : ''}`,
                phoneImei: payload.imei2 ? `${payload.imei} / ${payload.imei2}` : payload.imei,
              });
            });
            await Promise.all(updatePromises);
          }
        } catch (salesErr) {
          console.error('Error syncing sales with phone update:', salesErr);
        }

        await logAction(currentUser.uid, 'phone_updated', { phoneId: editingPhone.id, model: data.model });
        toast.success('Telefon yangilandi');
      } else {
        payload.createdAt = serverTimestamp();
        const urls = imageFiles.length > 0 ? await uploadImages() : [];
        payload.imageUrls = urls;
        const newRef = await addDoc(collection(db, 'phones'), payload);
        // Save supplier to contacts if not already exists
        if (data.supplierName) {
          const existingSupplier = suppliers.find(s => 
            s.name?.toLowerCase().trim() === data.supplierName.trim().toLowerCase()
          );
          
          if (!existingSupplier) {
            await addDoc(collection(db, 'contacts'), {
              name: data.supplierName,
              phone: data.supplierPhone || '',
              type: 'supplier',
              shopId,
              createdAt: serverTimestamp(),
            });
            fetchSuppliers(); // Refresh suppliers list
          }
        }
        await logAction(currentUser.uid, 'phone_added', { phoneId: newRef.id, model: data.model });
        toast.success('Telefon qo\'shildi');
      }

      setModalOpen(false);
      fetchPhones();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi: ' + (err.message || "Noma'lum xato"));
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteLoading(true);
      const phoneRef = doc(db, 'phones', deleteDialog.id);
      console.log('Attempting to soft delete phone:', deleteDialog.id);
      
      const updateData = {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid,
      };

      await updateDoc(phoneRef, updateData);
      
      console.log('Soft delete successful');
      await logAction(currentUser.uid, 'phone_deleted', { phoneId: deleteDialog.id });
      toast.success('Telefon o\'chirildi (Savatchaga o\'tdi)');
      setDeleteDialog({ open: false, id: null });
      fetchPhones();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('O\'chirishda xato: ' + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };
  
  const toggleArchive = async (phone) => {
    try {
      setArchiveLoading(true);
      const newStatus = !phone.isArchived;
      await updateDoc(doc(db, 'phones', phone.id), {
        isArchived: newStatus,
        updatedAt: serverTimestamp(),
      });
      await logAction(currentUser.uid, newStatus ? 'phone_archived' : 'phone_unarchived', { phoneId: phone.id, model: phone.model });
      toast.success(newStatus ? 'Telefon arxivlandi' : 'Telefon arxivdan chiqarildi');
      fetchPhones();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi: ' + (err.message || ''));
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleSupplierReturn = async (phone) => {
    const reason = window.prompt("Yetkazib beruvchiga qaytarish sababini kiriting (ixtiyoriy):");
    if (reason === null) return; // User cancelled

    try {
      setArchiveLoading(true);
      await updateDoc(doc(db, 'phones', phone.id), {
        status: 'Yetkazib beruvchiga qaytarilgan',
        isArchived: true,
        supplierReturnReason: reason,
        supplierReturnedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await logAction(currentUser.uid, 'phone_returned_to_supplier', { phoneId: phone.id, model: phone.model, reason });
      toast.success('Telefon yetkazib beruvchiga qaytarildi');
      setDetailOpen(false);
      fetchPhones();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi: ' + (err.message || ''));
    } finally {
      setArchiveLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Telefonlar</h1>
          <p className="text-sm text-dark-400">{phones.length} ta telefon</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(
              filtered,
              [
                { key: 'brand', label: 'Brand' },
                { key: 'model', label: 'Model' },
                { key: 'imei', label: 'IMEI 1' },
                { key: 'imei2', label: 'IMEI 2' },
                { key: 'purchaseDate', label: 'Xarid sanasi' },
                { key: 'condition', label: 'Holat' },
                { key: 'color', label: 'Rang' },
                { key: 'ram', label: 'RAM (OZU)' },
                { key: 'storageSize', label: 'Xotira' },
                { key: 'batteryHealth', label: 'Batareka (%)', format: (v, row) => row.brand === 'Apple' ? (v !== undefined && v !== null && v !== '' ? `${v}%` : '—') : '' },
                { key: 'chargeCount', label: 'Zaryadlash soni', format: (v, row) => row.brand === 'Apple' ? (v !== undefined && v !== null && v !== '' ? v : '—') : '' },
                { key: 'hasBox', label: 'Karobka', format: (v) => v ? 'Bor' : 'Yo\'q' },
                { key: 'status', label: 'Status' },
                { key: 'uzimei', label: 'UZIMEI holati', format: (v) => v || "O'tmagan" },
                { key: 'purchasePriceUSD', label: 'Narx (USD)', format: (v) => v ? `$${v}` : '' },
                { key: 'purchasePriceUZS', label: "Narx (so'm)", format: (v) => v ? v.toLocaleString() : '' },
                { key: 'supplierName', label: 'Yetkazib beruvchi' },
                { key: 'createdAt', label: "Qo'shilgan sana", format: formatExportDate },
              ],
              'telefonlar'
            )}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel yuklab olish</span>
          </button>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showArchived 
                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400' 
                : 'bg-dark-100 text-dark-600 hover:bg-dark-200 dark:bg-dark-700 dark:text-dark-400'
            }`}
          >
            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {showArchived ? "Sotuvdagilarni ko'rish" : "Arxivni ko'rish"}
          </button>
          {hasPermission('add_phone') && (
            <div className="flex gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Import (Excel/PDF)</span>
              </button>
              <button onClick={openAdd} className="btn-primary">
                <Plus className="w-4 h-4" /> Telefon qo'shish
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Nomi, model, IMEI yoki yetkazib beruvchi..."
              className="input pl-9"
            />
          </div>
          <select value={filterBrand} onChange={(e) => { setFilterBrand(e.target.value); setCurrentPage(1); }} className="input w-full sm:w-36">
            <option value="">Barcha brand</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="input w-full sm:w-36">
            <option value="">Barcha status</option>
            {PHONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterCondition} onChange={(e) => { setFilterCondition(e.target.value); setCurrentPage(1); }} className="input w-full sm:w-32">
            <option value="">Barcha holat</option>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 border border-dark-100 dark:border-dark-700 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900/20 rounded-xl flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <p className="text-xs text-dark-400">Jami telefonlar</p>
            <p className="text-lg font-bold text-dark-900 dark:text-white">{filtered.length} ta</p>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 border border-dark-100 dark:border-dark-700 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-dark-400">Umumiy tannarx (USD)</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatUSD(totalPurchasePriceUSD)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-dark-800 rounded-2xl p-4 border border-dark-100 dark:border-dark-700 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-dark-400">Umumiy tannarx (UZS)</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatUZS(totalPurchasePriceUZS)}</p>
          </div>
        </div>
      </div>

      {/* Table & Grid View */}
      <div className="space-y-4">
        {/* Mobile/Tablet Grid View */}
        <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
          {paginated.length === 0 ? (
            <div className="col-span-full card p-12 text-center text-dark-400">
              <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Telefon topilmadi</p>
            </div>
          ) : (
            paginated.map((phone) => (
              <div key={phone.id} className="card p-4 space-y-4">
                <div className="flex items-start gap-3">
                  {phone.imageUrls?.[0] ? (
                    <img src={phone.imageUrls[0]} alt="" className="w-16 h-16 rounded-xl object-cover shadow-sm" />
                  ) : (
                    <div className="w-16 h-16 bg-dark-100 dark:bg-dark-700 rounded-xl flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-dark-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-dark-900 dark:text-white truncate">
                        {phone.brand} {phone.model}
                      </h3>
                      <span className={getStatusBadge(phone.status)}>{phone.status}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className={getConditionBadge(phone.condition)}>{phone.condition}</span>
                      {phone.ram && (
                        <span className="px-1.5 py-0.5 bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-400 text-[10px] rounded font-medium">
                          {phone.ram}
                        </span>
                      )}
                      {phone.storageSize && (
                        <span className="px-1.5 py-0.5 bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-400 text-[10px] rounded font-medium">
                          {phone.storageSize}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-dark-400 truncate">{phone.imei}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-dark-50 dark:border-dark-700/50">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency(currency === 'USD' ? phone.purchasePriceUSD : phone.purchasePriceUZS, currency)}
                    </span>
                    <span className="text-[10px] text-dark-400">
                      {currency === 'USD' ? formatUZS(phone.purchasePriceUZS) : formatUSD(phone.purchasePriceUSD)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => { setSelectedPhone(phone); setDetailOpen(true); }}
                      className="p-2 bg-dark-50 dark:bg-dark-700 text-dark-500 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {hasPermission('edit_phone') && (
                      <button
                        onClick={() => openEdit(phone)}
                        className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {hasPermission('edit_phone') && (
                      <button
                        onClick={() => toggleArchive(phone)}
                        disabled={archiveLoading}
                        className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-500 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                      >
                        {phone.isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden lg:block card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-50 dark:bg-dark-700/50">
                <tr>
                  <th className="table-header">
                    <button onClick={() => toggleSort('brand')} className="flex items-center gap-1">
                      Brand/Model <SortIcon field="brand" />
                    </button>
                  </th>
                  <th className="table-header">IMEI</th>
                  <th className="table-header">Holat</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">
                    <button onClick={() => toggleSort('purchasePrice')} className="flex items-center gap-1">
                      Narx <SortIcon field="purchasePrice" />
                    </button>
                  </th>
                  <th className="table-header">
                    <button onClick={() => toggleSort('purchaseDate')} className="flex items-center gap-1">
                      Sana <SortIcon field="purchaseDate" />
                    </button>
                  </th>
                  <th className="table-header">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-dark-400">
                      <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Telefon topilmadi</p>
                    </td>
                  </tr>
                ) : (
                  paginated.map((phone) => (
                    <tr key={phone.id} className="table-row">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          {phone.imageUrls?.[0] ? (
                            <img src={phone.imageUrls[0]} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 bg-dark-100 dark:bg-dark-700 rounded-lg flex items-center justify-center">
                              <Smartphone className="w-5 h-5 text-dark-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-dark-900 dark:text-white">{phone.brand}</p>
                            <p className="text-xs text-dark-400">{phone.model} {phone.ram ? `(${phone.ram})` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell font-mono text-xs">
                        <div className="flex flex-col items-start gap-1">
                          <span className={phone.uzimei?.toLowerCase().includes("o'tgan") ? 'text-green-600 dark:text-green-400 font-bold' : phone.uzimei?.toLowerCase().includes("o'tmagan") ? 'text-red-500 dark:text-red-400' : ''}>
                            {phone.imei}
                          </span>
                          {phone.uzimei && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded w-max ${
                              phone.uzimei.toLowerCase().includes("o'tgan") ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              UZIMEI: {phone.uzimei}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={getConditionBadge(phone.condition)}>{phone.condition}</span>
                      </td>
                      <td className="table-cell">
                        <span className={getStatusBadge(phone.status)}>{phone.status}</span>
                      </td>
                      <td className="table-cell font-medium">
                        <div className="flex flex-col">
                          <span>{formatCurrency(currency === 'USD' ? phone.purchasePriceUSD : phone.purchasePriceUZS, currency)}</span>
                          <span className="text-[10px] text-dark-400 font-normal">
                            {currency === 'USD' ? formatUZS(phone.purchasePriceUZS) : formatUSD(phone.purchasePriceUSD)}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell text-dark-400">
                        <div className="flex flex-col">
                          <span className="text-dark-900 dark:text-white font-medium">
                            {phone.purchaseDate || formatDate(phone.createdAt)}
                          </span>
                          <span className="text-xs text-dark-400">
                            {formatTime(phone.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedPhone(phone); setDetailOpen(true); }}
                            className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                            title="Ko'rish"
                          >
                            <Eye className="w-4 h-4 text-dark-500" />
                          </button>
                          {hasPermission('edit_phone') && (
                            <button
                              onClick={() => openEdit(phone)}
                              className="p-1.5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                              title="Tahrirlash"
                            >
                              <Edit2 className="w-4 h-4 text-primary-600" />
                            </button>
                          )}
                          {hasPermission('edit_phone') && (
                            <button
                              onClick={() => toggleArchive(phone)}
                              className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                              title={phone.isArchived ? "Arxivdan chiqarish" : "Arxivlash"}
                              disabled={archiveLoading}
                            >
                              {phone.isArchived ? (
                                <ArchiveRestore className="w-4 h-4 text-orange-500" />
                              ) : (
                                <Archive className="w-4 h-4 text-orange-500" />
                              )}
                            </button>
                          )}
                          {hasPermission('delete_phone') && selectedPhone?.isArchived && (
                            <button
                              onClick={() => setDeleteDialog({ open: true, id: phone.id })}
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="O'chirish"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={sorted.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPhone ? 'Telefonni tahrirlash' : 'Yangi telefon qo\'shish'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Brand *</label>
              <select {...register('brand')} className="input">
                <option value="">Tanlang</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {errors.brand && <p className="text-red-500 text-xs mt-1">{errors.brand.message}</p>}
            </div>
            <div>
              <label className="label">Model *</label>
              <input {...register('model')} className="input" placeholder="Masalan: iPhone 15 Pro" />
              {errors.model && <p className="text-red-500 text-xs mt-1">{errors.model.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">IMEI 1 {isWifiTablet ? '(ixtiyoriy)' : '*'}</label>
              <input
                {...register('imei', {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 15);
                  }
                })}
                className="input font-mono text-sm"
                placeholder="35..."
              />
              {errors.imei && <p className="text-red-500 text-xs mt-1">{errors.imei.message}</p>}
            </div>
            <div>
              <label className="label">IMEI 2 (ixtiyoriy)</label>
              <input
                {...register('imei2', {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 15);
                  }
                })}
                className="input font-mono text-sm"
                placeholder="35..."
              />
              {errors.imei2 && <p className="text-red-500 text-xs mt-1">{errors.imei2.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">📅 Xarid sanasi *</label>
              <input {...register('purchaseDate')} type="date" className="input" />
              {errors.purchaseDate && <p className="text-red-500 text-xs mt-1">{errors.purchaseDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Holat *</label>
              <select {...register('condition')} className="input">
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">UZIMEI Holati</label>
              <select {...register('uzimei')} className="input">
                <option value="">Tanlang</option>
                <option value="Ikkalasi o'tgan">Ikkalasi o'tgan</option>
                <option value="Faqat IMEI 1 o'tgan">Faqat IMEI 1 o'tgan</option>
                <option value="Faqat IMEI 2 o'tgan">Faqat IMEI 2 o'tgan</option>
                <option value="O'tmagan">O'tmagan</option>
              </select>
            </div>
            <div>
              <label className="label">Rang</label>
              <select {...register('color')} className="input">
                <option value="">Tanlang</option>
                {colors.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Xotira</label>
              <select {...register('storageSize')} className="input">
                <option value="">Tanlang</option>
                {STORAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {watchedBrand !== 'Apple' && watchedBrand !== '' && (
              <div>
                <label className="label">RAM (OZU)</label>
                <select {...register('ram')} className="input">
                  <option value="">Tanlang</option>
                  {RAM_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 bg-dark-50 dark:bg-dark-700/50 p-3 rounded-lg border border-dark-100 dark:border-dark-700">
            <input
              type="checkbox"
              id="hasBox"
              {...register('hasBox')}
              className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
            />
            <label htmlFor="hasBox" className="text-sm font-medium text-dark-700 dark:text-dark-200 cursor-pointer select-none">
              Karobkasi bor
            </label>
          </div>

          {/* Apple-specific fields */}
          {watchedBrand === 'Apple' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">🔋 Batareka holati (%) (ixtiyoriy)</label>
                <div className="relative">
                  <input
                    {...register('batteryHealth', { valueAsNumber: true })}
                    type="number"
                    className="input pr-8"
                    placeholder="85"
                    min={0}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm">%</span>
                </div>
                {errors.batteryHealth && <p className="text-red-500 text-xs mt-1">0–100 oralig'ida kiriting</p>}
              </div>
              <div>
                <label className="label">🔄 Zaryadlash soni (ixtiyoriy)</label>
                <input
                  {...register('chargeCount', { valueAsNumber: true })}
                  type="number"
                  className="input"
                  placeholder="150"
                  min={0}
                />
              </div>
            </div>
          )}

          {/* Exchange rate + USD price */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">💱 Dollar kursi:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={usdRate}
                    onChange={(e) => setUsdRate(Number(e.target.value) || 12700)}
                    className="w-28 px-2 py-1 bg-white dark:bg-dark-800 border border-blue-300 dark:border-blue-700 rounded-lg text-sm font-mono text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-blue-500">so'm</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Xarid narxi (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold text-sm">$</span>
                  <input
                    {...register('purchasePrice', { valueAsNumber: true })}
                    type="number"
                    className="input pl-7"
                    placeholder="0"
                    step="0.01"
                  />
                </div>
                {errors.purchasePrice && <p className="text-red-500 text-xs mt-1">{errors.purchasePrice.message}</p>}
              </div>
              <div>
                <label className="label">UZS ekvivalenti</label>
                <div className="flex items-center h-10 px-3 bg-dark-100 dark:bg-dark-700 border border-dark-200 dark:border-dark-600 rounded-lg">
                  <span className="text-sm font-medium text-dark-600 dark:text-dark-300 font-mono">
                    {watch('purchasePrice') ? (watch('purchasePrice') * usdRate).toLocaleString('uz-UZ') + " so'm" : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Status *</label>
            <select {...register('status')} className="input">
              {PHONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {suppliers.length > 0 && !editingPhone && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-dark-400">Tezkor tanlash (Oxirgi yetkazib beruvchilar)</label>
              <div className="flex flex-wrap gap-2">
                {suppliers.slice(0, 3).map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setValue('supplierName', s.name);
                      setValue('supplierPhone', s.phone || '');
                      setShowSupplierDropdown(false);
                    }}
                    className="px-3 py-1.5 bg-dark-50 dark:bg-dark-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-dark-100 dark:border-dark-700 rounded-full text-xs font-medium text-dark-700 dark:text-dark-200 transition-colors flex items-center gap-1.5"
                  >
                    <Users className="w-3 h-3 text-primary-500" />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="relative">
              <label className="label">Yetkazib beruvchi</label>
              <input 
                {...register('supplierName')} 
                className="input" 
                placeholder="Ism / tashkilot"
                onFocus={() => setShowSupplierDropdown(true)}
                autoComplete="off"
              />
              {showSupplierDropdown && suppliers.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  <div className="p-2 border-b border-dark-100 dark:border-dark-700 text-[10px] uppercase font-bold text-dark-400">
                    Mavjud yetkazib beruvchilar
                  </div>
                  {suppliers
                    .filter(s => !watch('supplierName') || s.name.toLowerCase().includes(watch('supplierName').toLowerCase()))
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-dark-50 dark:hover:bg-dark-700 text-sm flex flex-col"
                        onClick={() => {
                          setValue('supplierName', s.name);
                          setValue('supplierPhone', s.phone || '');
                          setShowSupplierDropdown(false);
                        }}
                      >
                        <span className="font-medium text-dark-900 dark:text-white">{s.name}</span>
                        {s.phone && <span className="text-xs text-dark-400">{s.phone}</span>}
                      </button>
                    ))}
                  <button
                    type="button"
                    className="w-full text-center py-2 text-xs text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/10 font-medium border-t border-dark-100 dark:border-dark-700"
                    onClick={() => setShowSupplierDropdown(false)}
                  >
                    Yopish
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Tel. raqam</label>
              <input {...register('supplierPhone')} className="input" placeholder="+998 __ ___ __ __" />
            </div>
          </div>

          <div>
            <label className="label">Izoh</label>
            <textarea {...register('notes')} className="input" rows={2} />
          </div>

          {/* Image upload */}
          <div>
            <label className="label">Rasmlar (max 5)</label>
            <div className="border-2 border-dashed border-dark-200 dark:border-dark-600 rounded-lg p-4">
              <input
                type="file"
                multiple
                accept="image/*"
                id="phone-images"
                className="hidden"
                onChange={(e) => setImageFiles(Array.from(e.target.files || []).slice(0, 5))}
              />
              <label htmlFor="phone-images" className="flex flex-col items-center gap-2 cursor-pointer">
                <Upload className="w-8 h-8 text-dark-400" />
                <span className="text-sm text-dark-500">Rasmlarni tanlang</span>
              </label>
              {imageFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {imageFiles.map((f, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(f)}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {editingPhone?.imageUrls?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {editingPhone.imageUrls.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={uploadingImages} className="btn-primary">
              {uploadingImages ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saqlanmoqda...
                </span>
              ) : editingPhone ? 'Yangilash' : 'Qo\'shish'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Telefon ma'lumotlari"
        size="lg"
      >
        {selectedPhone && (
          <div className="space-y-4">
            {selectedPhone.imageUrls?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {selectedPhone.imageUrls.map((url, i) => (
                  <img
                    key={i} src={url} alt=""
                    className="w-24 h-24 rounded-xl object-cover flex-shrink-0 cursor-pointer hover:opacity-80 hover:scale-105 transition-all ring-2 ring-transparent hover:ring-primary-500"
                    onClick={() => setLightbox({ open: true, urls: selectedPhone.imageUrls, index: i })}
                    title="Kattalashtirish uchun bosing"
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Brand', selectedPhone.brand],
                ['Model', selectedPhone.model],
                ['IMEI 1', selectedPhone.imei],
                ...(selectedPhone.imei2 ? [['IMEI 2', selectedPhone.imei2]] : []),
                ...(selectedPhone.uzimei ? [['UZIMEI', selectedPhone.uzimei]] : []),
                ['Holat', selectedPhone.condition],
                ['Status', selectedPhone.status],
                ['Rang', selectedPhone.color || '—'],
                ['RAM (OZU)', selectedPhone.ram || '—'],
                ['Xotira', selectedPhone.storageSize || '—'],
                ['Karobka', selectedPhone.hasBox ? 'Bor' : 'Yo\'q'],
                ...(selectedPhone.brand === 'Apple' && selectedPhone.batteryHealth != null
                  ? [['🔋 Batareka holati', `${selectedPhone.batteryHealth}%`]]
                  : []),
                ...(selectedPhone.brand === 'Apple' && selectedPhone.chargeCount != null
                  ? [['🔄 Zaryadlash soni', selectedPhone.chargeCount]]
                  : []),
                ['Xarid narxi', formatUZS(selectedPhone.purchasePriceUZS)],
                ['Xarid sanasi', selectedPhone.purchaseDate || formatDate(selectedPhone.createdAt)],
                ['USD narxi', formatUSD(selectedPhone.purchasePriceUSD)],
                ['Yetkazib beruvchi', selectedPhone.supplierName || '—'],
                ['Tel. raqam', selectedPhone.supplierPhone || '—'],
                ['Sana', formatDate(selectedPhone.createdAt)],
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
            {selectedPhone.notes && (
              <div className="bg-dark-50 dark:bg-dark-700 rounded-lg p-3">
                <p className="text-xs text-dark-400 mb-1">Izoh</p>
                <p className="text-sm text-dark-700 dark:text-dark-300">{selectedPhone.notes}</p>
              </div>
            )}
            {selectedPhone.status !== 'Sotilgan' && selectedPhone.status !== 'Yetkazib beruvchiga qaytarilgan' && (hasPermission('edit_phone') || hasPermission('delete_phone')) && (
              <div className="pt-4 border-t border-dark-100 dark:border-dark-700 flex justify-end gap-2">
                {hasPermission('delete_phone') && selectedPhone.isArchived && (
                  <button
                    onClick={() => { setDeleteDialog({ open: true, id: selectedPhone.id }); setDetailOpen(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-xl text-sm font-semibold transition-all shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    O'chirib yuborish
                  </button>
                )}
                <button
                  onClick={() => handleSupplierReturn(selectedPhone)}
                  disabled={archiveLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-xl text-sm font-semibold transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Yetkazib beruvchiga qaytarish
                </button>
              </div>
            )}
            {(selectedPhone.status === 'Sotilgan' || selectedPhone.status === 'Yetkazib beruvchiga qaytarilgan') && hasPermission('delete_phone') && (
              <div className="pt-4 border-t border-dark-100 dark:border-dark-700 flex justify-end">
                <button
                  onClick={() => { setDeleteDialog({ open: true, id: selectedPhone.id }); setDetailOpen(false); }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-xl text-sm font-semibold transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Bazadan o'chirib yuborish
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDelete}
        loading={deleteLoading}
        title="Telefonni o'chirish"
        message="Bu amalni bekor qilib bo'lmaydi. Davom etasizmi?"
      />

      {/* Lightbox */}
      {lightbox.open && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center"
          onClick={() => setLightbox({ ...lightbox, open: false })}
        >
          {/* Close */}
          <button
            onClick={() => setLightbox({ ...lightbox, open: false })}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-light w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-all"
          >
            ✕
          </button>

          {/* Prev */}
          {lightbox.urls.length > 1 && lightbox.index > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: l.index - 1 })); }}
              className="absolute left-4 text-white/70 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all"
            >
              ‹
            </button>
          )}

          {/* Image */}
          <img
            src={lightbox.urls[lightbox.index]}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {lightbox.urls.length > 1 && lightbox.index < lightbox.urls.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: l.index + 1 })); }}
              className="absolute right-4 text-white/70 hover:text-white text-4xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all"
            >
              ›
            </button>
          )}

          {/* Counter */}
          {lightbox.urls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {lightbox.urls.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightbox((l) => ({ ...l, index: i })); }}
                  className={`w-2 h-2 rounded-full transition-all ${i === lightbox.index ? 'bg-white' : 'bg-white/30'}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={fetchPhones}
      />
    </div>
  );
};

export default PhonesPage;
