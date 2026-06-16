import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, serverTimestamp, where,
  doc, updateDoc, deleteDoc, Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Plus, Search, TrendingDown, Edit2, Trash2 } from 'lucide-react';
import { formatUZS, formatCurrency, formatDate, getTashkentDateString } from '../utils/helpers';

const schema = z.object({
  category: z.string().min(1, 'Kategoriya tanlang'),
  amountCurrency: z.enum(['UZS', 'USD']),
  amount: z.number({ coerce: true }).min(1),
  date: z.string().min(1),
  description: z.string().optional(),
});

const ITEMS_PER_PAGE = 10;

const categoryColors = {
  'Ijara': 'badge-blue',
  'Maosh': 'badge-green',
  'Transport': 'badge-yellow',
  'Reklama': 'badge-red',
  'Boshqa': 'badge-gray',
};

const ExpensesPage = () => {
  const { hasPermission, logAction, currentUser, userProfile } = useAuth();
  const { expenseCategories, currency, exchangeRate } = useSettings();
  const shopId = userProfile?.shopId;
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amountCurrency: currency || 'UZS',
      date: getTashkentDateString(),
    },
  });

  useEffect(() => {
    if (currency) setValue('amountCurrency', currency);
  }, [currency, setValue]);

  const fetchExpenses = useCallback(async () => {
    if (!shopId) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'expenses'), where('shopId', '==', shopId))
      );
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setExpenses(data);
    } catch {
      toast.error('Yuklanishda xato');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const onSubmit = async (data) => {
    try {
      setSubmitting(true);
      const rate = exchangeRate || 12700;
      const amountUZS = data.amountCurrency === 'USD' ? data.amount * rate : data.amount;
      const amountUSD = data.amountCurrency === 'USD' ? data.amount : data.amount / rate;

      const expenseData = {
        ...data,
        shopId,
        amountUZS,
        amountUSD,
        usdRate: rate,
        date: Timestamp.fromDate(new Date(data.date)),
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), expenseData);
        await logAction(currentUser.uid, 'expense_updated', { id: editingId, category: data.category, amount: data.amount });
        toast.success('Xarajat yangilandi');
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...expenseData,
          createdAt: serverTimestamp(),
        });
        await logAction(currentUser.uid, 'expense_added', { category: data.category, amount: data.amount });
        toast.success('Xarajat qo\'shildi');
      }

      setModalOpen(false);
      setEditingId(null);
      reset({ amountCurrency: 'USD', date: getTashkentDateString() });
      fetchExpenses();
    } catch (error) {
      console.error(error);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (exp) => {
    setEditingId(exp.id);
    const dateStr = getTashkentDateString(exp.date);
    
    reset({
      category: exp.category,
      amountCurrency: 'USD',
      amount: exp.amount,
      date: dateStr,
      description: exp.description || '',
    });
    setModalOpen(true);
  };

  const handleDelete = async () => {
    try {
      setSubmitting(true);
      await deleteDoc(doc(db, 'expenses', deletingId));
      await logAction(currentUser.uid, 'expense_deleted', { id: deletingId });
      toast.success('Xarajat o\'chirildi');
      setDeletingId(null);
      fetchExpenses();
    } catch {
      toast.error('O\'chirishda xato');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = expenses.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.description?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q);
    const matchCategory = !filterCategory || e.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const totalByCategory = (expenseCategories || []).reduce((acc, cat) => {
    acc[cat] = expenses.filter((e) => e.category === cat).reduce((s, e) => s + (e.amountUZS || 0), 0);
    return acc;
  }, {});

  const grandTotal = Object.values(totalByCategory).reduce((a, b) => a + b, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Chiqimlar</h1>
          <p className="text-sm text-dark-400">{expenses.length} ta xarajat</p>
        </div>
        {hasPermission('add_expenses') && (
          <button onClick={() => { setEditingId(null); reset({ amountCurrency: 'USD', date: getTashkentDateString() }); setModalOpen(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Xarajat qo'shish
          </button>
        )}
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(expenseCategories || []).map((cat) => (
          <div key={cat} className="card p-4 text-center cursor-pointer hover:border-primary-300 transition-colors" onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}>
            <p className="text-xs text-dark-400 mb-1">{cat}</p>
            <p className="text-sm font-bold text-dark-900 dark:text-white">
              {formatCurrency(currency === 'USD' ? (totalByCategory[cat] / (exchangeRate || 12700)) : totalByCategory[cat], currency)}
            </p>
          </div>
        ))}
        <div className="card p-4 text-center bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800">
          <p className="text-xs text-red-400 mb-1">Jami</p>
          <p className="text-sm font-bold text-red-600">
            {formatCurrency(currency === 'USD' ? (grandTotal / (exchangeRate || 12700)) : grandTotal, currency)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Izoh bo'yicha qidirish..." className="input pl-9" />
        </div>
        <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="input w-full sm:w-48">
          <option value="">Barcha kategoriya</option>
          {(expenseCategories || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-50 dark:bg-dark-700/50">
              <tr>
                <th className="table-header">Kategoriya</th>
                <th className="table-header">Miqdor</th>
                <th className="table-header">Sana</th>
                <th className="table-header">Izoh</th>
                <th className="table-header text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-12 text-dark-400">
                  <TrendingDown className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Xarajat topilmadi</p>
                </td></tr>
              ) : (
                paginated.map((exp) => (
                  <tr key={exp.id} className="table-row">
                    <td className="table-cell">
                      <span className={categoryColors[exp.category] || 'badge-gray'}>{exp.category}</span>
                    </td>
                    <td className="table-cell font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(currency === 'USD' ? (exp.amountUSD || exp.amountUZS / (exp.usdRate || exchangeRate || 12700)) : exp.amountUZS, currency)}
                    </td>
                    <td className="table-cell text-dark-400">{formatDate(exp.date)}</td>
                    <td className="table-cell text-dark-500">{exp.description || '—'}</td>
                    <td className="table-cell text-right">
                      <div className="flex justify-end gap-2">
                        {hasPermission('add_expenses') && (
                          <button onClick={() => handleEdit(exp)} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('delete_expenses') ? (
                          <button onClick={() => setDeletingId(exp.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : hasPermission('add_expenses') && (
                          <button onClick={() => setDeletingId(exp.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
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
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} />
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "Xarajatni tahrirlash" : "Yangi xarajat"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Kategoriya *</label>
            <select {...register('category')} className="input">
              <option value="">Tanlang</option>
              {(expenseCategories || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>}
          </div>

          <input type="hidden" {...register('amountCurrency')} value="USD" />
          <div>
            <label className="label">Miqdor (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold">$</span>
              <input {...register('amount', { valueAsNumber: true })} type="number" className="input pl-7" step="0.01" placeholder="0.00" />
            </div>
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="label">Sana *</label>
            <input {...register('date')} type="date" className="input" />
          </div>

          <div>
            <label className="label">Izoh</label>
            <textarea {...register('description')} className="input" rows={3} />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Xarajatni o'chirish"
        message="Haqiqatan ham ushbu xarajatni o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi."
        loading={submitting}
      />
    </div>
  );
};

export default ExpensesPage;
