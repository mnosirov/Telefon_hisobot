import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc,
  doc, serverTimestamp, where, arrayUnion, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { sendShopSms } from '../utils/smsService';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { Plus, Search, CreditCard, AlertTriangle, CheckCircle, Clock, DollarSign, RotateCcw, MessageSquare, Send, Loader2 } from 'lucide-react';
import {
  formatUZS, formatDate, getDebtStatusBadge, isOverdue, formatCurrency, getTashkentDateString,
} from '../utils/helpers';
import { DEBT_STATUSES } from '../utils/constants';

const creditSchema = z.object({
  phoneId: z.string().min(1, 'Telefon tanlang'),
  buyerName: z.string().min(1, 'Xaridor ismini kiriting'),
  buyerPhone: z.string().optional(),
  saleDate: z.string().min(1),
  totalPrice: z.number({ coerce: true }).min(1),
  initialPayment: z.number({ coerce: true }).min(0),
  dueDate: z.string().min(1, 'Muddat sanasini kiriting'),
  months: z.number({ coerce: true }).min(1).default(1),
  markupPercent: z.number({ coerce: true }).min(0).default(0),
  cashPrice: z.number({ coerce: true }).min(0).default(0),
  currency: z.enum(['UZS', 'USD']).default('UZS'),
  notes: z.string().optional(),
});

const paymentSchema = z.object({
  amount: z.number({ coerce: true }).min(1),
  date: z.string().min(1),
  notes: z.string().optional(),
});

const ITEMS_PER_PAGE = 10;

const CreditsPage = () => {
  const { hasPermission, logAction, currentUser, userProfile } = useAuth();
  const { currency, exchangeRate, shopData } = useSettings();
  const shopId = userProfile?.shopId;
  const [credits, setCredits] = useState([]);
  const [phones, setPhones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({
    reason: '',
    refundAmount: 0,
    newPhoneStatus: 'Sotuvda',
  });
  const [sendingReminders, setSendingReminders] = useState(false);
  const [upcomingReminders, setUpcomingReminders] = useState([]);

  const getInitialDueDate = (saleDateStr) => {
    const d = new Date(saleDateStr);
    d.setMonth(d.getMonth() + 1);
    return getTashkentDateString(d);
  };

  const initialSaleDate = getTashkentDateString();
  const initialDueDate = getInitialDueDate(initialSaleDate);

  const { register: regCredit, handleSubmit: hCredit, reset: rCredit, watch, setValue, formState: { errors: eCredit } } = useForm({
    resolver: zodResolver(creditSchema),
    defaultValues: { 
      saleDate: initialSaleDate,
      dueDate: initialDueDate,
      initialPayment: 0,
      months: 1,
      markupPercent: 0,
      cashPrice: 0,
      currency: 'UZS'
    },
  });

  const { register: regPay, handleSubmit: hPay, reset: rPay, formState: { errors: ePay } } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: { date: getTashkentDateString() },
  });

  const watchPhoneId = watch('phoneId');
  const watchMonths = watch('months');
  const watchMarkupPercent = watch('markupPercent');
  const watchTotalPrice = watch('totalPrice');
  const watchInitialPayment = watch('initialPayment');
  const watchCurrency = watch('currency');

  const watchCashPrice = watch('cashPrice');
  const watchSaleDate = watch('saleDate');

  // Auto-set dueDate (first payment due date) to 1 month after saleDate
  useEffect(() => {
    if (watchSaleDate) {
      const d = new Date(watchSaleDate);
      d.setMonth(d.getMonth() + 1);
      const nextDateStr = getTashkentDateString(d);
      setValue('dueDate', nextDateStr);
    }
  }, [watchSaleDate, setValue]);

  // Set initial cashPrice when phone or currency is selected
  useEffect(() => {
    if (watchPhoneId && phones.length > 0) {
      const phone = phones.find(p => p.id === watchPhoneId);
      if (phone) {
        const basePrice = watchCurrency === 'USD' ? (phone.purchasePriceUSD || 0) : (phone.purchasePriceUZS || 0);
        setValue('cashPrice', basePrice);
      }
    }
  }, [watchPhoneId, watchCurrency, phones, setValue]);

  // Auto-calculate totalPrice based on cashPrice, initialPayment, and flat markup
  useEffect(() => {
    const remainder = Math.max(0, (watchCashPrice || 0) - (watchInitialPayment || 0));
    const totalInterest = remainder * ((watchMarkupPercent || 0) / 100);
    const finalPrice = (watchInitialPayment || 0) + remainder + totalInterest;
    setValue('totalPrice', finalPrice);
  }, [watchCashPrice, watchInitialPayment, watchMarkupPercent, setValue]);

  const monthlyPaymentAmount = Math.max(0, ((watchTotalPrice || 0) - (watchInitialPayment || 0)) / (watchMonths || 1));

  const watchDueDate = watch('dueDate');
  const generatedSchedule = [];
  if (watchMonths > 1 && watchDueDate) {
    let d = new Date(watchDueDate);
    for (let i = 0; i < watchMonths; i++) {
      generatedSchedule.push({
        month: i + 1,
        date: new Date(d),
        amount: monthlyPaymentAmount
      });
      d.setMonth(d.getMonth() + 1);
    }
  }


  const fetchData = useCallback(async () => {
    if (!shopId) return;
    try {
      const [creditsSnap, phonesSnap] = await Promise.all([
        getDocs(query(collection(db, 'credits'), where('shopId', '==', shopId))),
        getDocs(query(collection(db, 'phones'), where('shopId', '==', shopId), where('status', '==', 'Sotuvda'))),
      ]);
      const creditsData = [];
      creditsSnap.forEach((d) => creditsData.push({ id: d.id, ...d.data() }));
      creditsData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      const phonesData = [];
      phonesSnap.forEach((d) => phonesData.push({ id: d.id, ...d.data() }));
      setCredits(creditsData);
      setPhones(phonesData);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Yuklanishda xato');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Dynamically calculate which credits are due tomorrow and need reminders
  useEffect(() => {
    if (credits.length === 0 || !shopData?.smsEnabled || !shopData?.smsOnReminder) {
      setUpcomingReminders([]);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTime = tomorrow.getTime();
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const list = credits.filter((c) => {
      // Must not be fully paid or returned
      if (c.status === "To'liq to'langan" || c.status === 'Qaytarilgan' || c.remainingDebt <= 0) {
        return false;
      }

      // Must not have already sent reminder for tomorrow's payment
      if (c.lastReminderSentAt === tomorrowStr) {
        return false;
      }

      // Must have a buyer phone number
      if (!c.buyerPhone) {
        return false;
      }

      // Calculate next due date
      let dueDateObj = null;
      if (!c.paymentSchedule || c.paymentSchedule.length === 0) {
        dueDateObj = c.dueDate?.toDate?.() || new Date(c.dueDate);
      } else {
        const sorted = [...c.paymentSchedule].sort((a, b) => new Date(a.date) - new Date(b.date));
        const totalPaid = (c.paymentHistory || []).reduce((sum, p) => sum + p.amount, 0);
        let paidLeft = totalPaid;
        
        for (const item of sorted) {
          if (paidLeft >= item.amount) {
            paidLeft -= item.amount;
          } else {
            dueDateObj = new Date(item.date);
            break;
          }
        }
        if (!dueDateObj) {
          dueDateObj = c.dueDate?.toDate?.() || new Date(c.dueDate);
        }
      }

      if (!dueDateObj) return false;
      dueDateObj.setHours(0, 0, 0, 0);
      
      return dueDateObj.getTime() === tomorrowTime;
    });

    setUpcomingReminders(list);
  }, [credits, shopData]);

  const handleSendReminders = async () => {
    if (upcomingReminders.length === 0) return;
    try {
      setSendingReminders(true);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      let successCount = 0;
      
      for (const credit of upcomingReminders) {
        let dueAmount = credit.monthlyPaymentAmount || credit.remainingDebt;
        let dueDateObj = null;
        
        if (credit.paymentSchedule?.length > 0) {
          const sorted = [...credit.paymentSchedule].sort((a, b) => new Date(a.date) - new Date(b.date));
          const totalPaid = (credit.paymentHistory || []).reduce((sum, p) => sum + p.amount, 0);
          let paidLeft = totalPaid;
          
          for (const item of sorted) {
            if (paidLeft >= item.amount) {
              paidLeft -= item.amount;
            } else {
              dueAmount = item.amount;
              dueDateObj = new Date(item.date);
              break;
            }
          }
        }
        
        if (!dueDateObj) {
          dueDateObj = credit.dueDate?.toDate?.() || new Date(credit.dueDate);
        }

        const formattedDate = dueDateObj.toLocaleDateString('uz-UZ');
        const smsMessage = `Hurmatli ${credit.buyerName}, eslatib o'tamiz, ertaga (${formattedDate}) sizning ${credit.phoneName} uchun oylik nasiya to'lovingiz muddati keladi. To'lov summasi: ${dueAmount.toLocaleString()} ${credit.currency}. Iltimos, o'z vaqtida to'lashni unutmang. Rahmat!`;

        const res = await sendShopSms(shopId, shopData, credit.buyerPhone, smsMessage);
        
        if (res.success) {
          await updateDoc(doc(db, 'credits', credit.id), {
            lastReminderSentAt: tomorrowStr
          });
          successCount++;
        }
      }

      toast.success(`${successCount} ta mijozga eslatma SMSlari muvaffaqiyatli yuborildi!`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Eslatmalarni yuborishda xatolik yuz berdi');
    } finally {
      setSendingReminders(false);
    }
  };

  const onAddCredit = async (data) => {
    try {
      setSubmitting(true);
      const remainingDebt = data.totalPrice - data.initialPayment;
      const phone = phones.find((p) => p.id === data.phoneId);
      const status = remainingDebt <= 0 ? "To'liq to'langan" : data.initialPayment > 0 ? "Qisman to'langan" : "To'lanmagan";

      const profit = data.currency === 'USD' 
        ? (data.totalPrice - (phone?.purchasePriceUSD || 0)) * (exchangeRate || 12700)
        : data.totalPrice - (phone?.purchasePriceUZS || 0);
      const saleDate = Timestamp.fromDate(new Date(data.saleDate));

      // 1. Create sale record first to get its ID
      const saleRef = await addDoc(collection(db, 'sales'), {
        phoneId: data.phoneId,
        phoneName: `${phone?.brand} ${phone?.model}`,
        phoneImei: phone?.imei,
        buyerName: data.buyerName,
        salePriceUZS: data.currency === 'UZS' ? data.totalPrice : data.totalPrice * (exchangeRate || 12700),
        salePriceUSD: data.currency === 'USD' ? data.totalPrice : data.totalPrice / (exchangeRate || 12700),
        purchasePriceUZS: phone?.purchasePriceUZS || 0,
        purchasePriceUSD: phone?.purchasePriceUSD || 0,
        profit: profit,
        paymentMethod: 'Nasiya',
        isPaid: remainingDebt <= 0,
        initialPayment: data.initialPayment,
        saleDate: saleDate,
        shopId,
        createdAt: serverTimestamp(),
      });

      const schedule = [];
      if (data.months > 1) {
        let d = new Date(data.dueDate);
        const amt = data.months > 1 ? remainingDebt / data.months : remainingDebt;
        for (let i = 0; i < data.months; i++) {
          schedule.push({
            monthIndex: i + 1,
            date: new Date(d).toISOString(),
            amount: amt,
            status: "Kutilmoqda"
          });
          d.setMonth(d.getMonth() + 1);
        }
      }

      // 2. Create credit record
      await addDoc(collection(db, 'credits'), {
        ...data,
        saleId: saleRef.id,
        shopId,
        remainingDebt,
        status,
        phoneName: `${phone?.brand} ${phone?.model}`,
        phoneImei: phone?.imei,
        monthlyPaymentAmount: data.months > 1 ? remainingDebt / data.months : remainingDebt,
        paymentSchedule: schedule,
        paymentHistory: data.initialPayment > 0 ? [{
          amount: data.initialPayment,
          date: new Date().toISOString(),
          notes: 'Boshlang\'ich to\'lov',
        }] : [],
        createdAt: serverTimestamp(),
        dueDate: Timestamp.fromDate(new Date(data.dueDate)),
      });

      // 3. Update phone status
      await updateDoc(doc(db, 'phones', data.phoneId), {
        status: 'Qarzda',
        buyerName: data.buyerName,
        isArchived: true,
      });

      // 4. Save contact
      await addDoc(collection(db, 'contacts'), {
        name: data.buyerName,
        phone: data.buyerPhone || '',
        type: 'buyer',
        shopId,
        createdAt: serverTimestamp(),
      });

      // Send SMS notification if enabled
      if (shopData?.smsEnabled && shopData?.smsOnNewCredit && data.buyerPhone) {
        const remainingDebt = data.totalPrice - data.initialPayment;
        const monthlyPaymentAmount = data.months > 1 ? remainingDebt / data.months : remainingDebt;
        const smsMessage = `Hurmatli ${data.buyerName}, sizning nomingizga ${phone?.brand} ${phone?.model} telefoni uchun ${data.totalPrice.toLocaleString()} ${data.currency} miqdoridagi qarz shartnomasi rasmiylashtirildi. Boshlang'ich to'lov: ${data.initialPayment.toLocaleString()} ${data.currency}. Oylik to'lov: ${monthlyPaymentAmount.toLocaleString()} ${data.currency}. Xaridingiz uchun rahmat!`;
        
        sendShopSms(shopId, shopData, data.buyerPhone, smsMessage).then((res) => {
          if (res.success) {
            toast.success('SMS xabarnoma mijozga yuborildi');
          } else {
            toast.error('SMS yuborib bo\'lmadi: ' + (res.error || res.reason || 'Noma\'lum sabab'));
          }
        }).catch((err) => {
          toast.error('SMS yuborishda xatolik: ' + err.message);
        });
      }

      await logAction(currentUser.uid, 'sale_created', { type: 'credit', buyer: data.buyerName });
      toast.success('Qarzga sotuv qo\'shildi');
      setAddModalOpen(false);
      rCredit();
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const onPayment = async (data) => {
    try {
      setSubmitting(true);
      const newRemaining = selectedCredit.remainingDebt - data.amount;
      const newStatus = newRemaining <= 0
        ? "To'liq to'langan"
        : "Qisman to'langan";

      await updateDoc(doc(db, 'credits', selectedCredit.id), {
        remainingDebt: Math.max(0, newRemaining),
        status: newStatus,
        paymentHistory: arrayUnion({
          amount: data.amount,
          date: data.date,
          notes: data.notes || '',
        }),
      });

      if (newStatus === "To'liq to'langan") {
        if (selectedCredit.phoneId) {
          await updateDoc(doc(db, 'phones', selectedCredit.phoneId), { 
            status: 'Sotilgan',
            isArchived: true,
          });
        }
        if (selectedCredit.saleId) {
          await updateDoc(doc(db, 'sales', selectedCredit.saleId), {
            isPaid: true
          });
        }
      }

      // Send SMS notification if enabled
      if (shopData?.smsEnabled && shopData?.smsOnPayment && selectedCredit.buyerPhone) {
        const smsMessage = `Hurmatli ${selectedCredit.buyerName}, sizdan ${data.amount.toLocaleString()} ${selectedCredit.currency} miqdoridagi to'lov qabul qilindi. Qolgan qarz: ${Math.max(0, newRemaining).toLocaleString()} ${selectedCredit.currency}. Rahmat!`;
        
        sendShopSms(shopId, shopData, selectedCredit.buyerPhone, smsMessage).then((res) => {
          if (res.success) {
            toast.success('SMS xabarnoma mijozga yuborildi');
          } else {
            toast.error('SMS yuborib bo\'lmadi: ' + (res.error || res.reason || 'Noma\'lum sabab'));
          }
        }).catch((err) => {
          toast.error('SMS yuborishda xatolik: ' + err.message);
        });
      }

      await logAction(currentUser.uid, 'debt_payment', { creditId: selectedCredit.id, amount: data.amount });
      toast.success('To\'lov qabul qilindi');
      setPayModalOpen(false);
      rPay();
      fetchData();
    } catch {
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const onReturn = async () => {
    try {
      setSubmitting(true);
      
      // 1. Create return record
      await addDoc(collection(db, 'returns'), {
        reason: returnForm.reason,
        refundAmount: returnForm.refundAmount,
        newPhoneStatus: returnForm.newPhoneStatus,
        saleId: selectedCredit.id, // We use creditId as saleId here
        phoneId: selectedCredit.phoneId,
        phoneName: selectedCredit.phoneName,
        phoneImei: selectedCredit.phoneImei,
        buyerName: selectedCredit.buyerName,
        shopId,
        createdAt: serverTimestamp(),
      });

      // 2. Update credit status
      await updateDoc(doc(db, 'credits', selectedCredit.id), {
        status: 'Qaytarilgan',
        remainingDebt: 0,
        returnReason: returnForm.reason,
        refundAmount: returnForm.refundAmount,
        returnedAt: serverTimestamp(),
      });

      // 3. Update phone status
      if (selectedCredit.phoneId) {
        await updateDoc(doc(db, 'phones', selectedCredit.phoneId), {
          status: returnForm.newPhoneStatus,
          isArchived: false,
        });
      }

      await logAction(currentUser.uid, 'credit_returned', { creditId: selectedCredit.id, buyer: selectedCredit.buyerName });
      toast.success('Tovar qaytarildi');
      setReturnModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Xato yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = credits.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.buyerName, c.phoneName, c.phoneImei].some((f) => f?.toLowerCase().includes(q));
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const overdueCount = credits.filter((c) => {
    const due = c.dueDate?.toDate?.() || new Date(c.dueDate);
    return c.status !== "To'liq to'langan" && due < new Date();
  }).length;

  const totalDebt = credits.reduce((a, c) => {
    if (c.status !== "To'liq to'langan") {
      const amount = c.currency === 'UZS' ? (c.remainingDebt || 0) / (exchangeRate || 12700) : (c.remainingDebt || 0);
      return a + amount;
    }
    return a;
  }, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5 animate-fade-in">
      {upcomingReminders.length > 0 && (
        <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 text-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark-900 dark:text-white">Ertangi to'lovlar uchun eslatma (SMS)</h3>
              <p className="text-xs text-dark-500 dark:text-dark-400 mt-0.5">
                Ertaga to'lov muddati tugaydigan <strong>{upcomingReminders.length} ta</strong> nasiya shartnomasi bor. Mijozlarga eslatma SMSlarini yuborishingiz mumkin.
              </p>
            </div>
          </div>
          <button 
            onClick={handleSendReminders} 
            disabled={sendingReminders}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap self-stretch sm:self-auto justify-center"
          >
            {sendingReminders ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Yuborilmoqda...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                SMS Eslatmalarni Yuborish
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Qarzlar</h1>
          <p className="text-sm text-dark-400">{credits.length} ta qarz</p>
        </div>
        {hasPermission('manage_credits') && (
          <button 
            onClick={() => { 
              const today = getTashkentDateString();
              const due = getInitialDueDate(today);
              rCredit({ 
                saleDate: today,
                dueDate: due,
                initialPayment: 0,
                months: 1,
                markupPercent: 0,
                cashPrice: 0,
                currency: 'UZS'
              }); 
              setAddModalOpen(true); 
            }} 
            className="btn-primary"
          >
            <Plus className="w-4 h-4" /> Qarzga sotuv
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Jami qarz</p>
            <p className="text-lg font-bold text-dark-900 dark:text-white">{formatCurrency(totalDebt, 'USD')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">Muddati o'tgan</p>
            <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm text-dark-400">To'langan</p>
            <p className="text-2xl font-bold text-dark-900 dark:text-white">
              {credits.filter((c) => c.status === "To'liq to'langan").length}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Xaridor yoki telefon..." className="input pl-9" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-full sm:w-48">
          <option value="">Barcha status</option>
          {DEBT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-50 dark:bg-dark-700/50">
              <tr>
                <th className="table-header">Xaridor</th>
                <th className="table-header">Telefon</th>
                <th className="table-header">Jami narx</th>
                <th className="table-header">Qolgan qarz</th>
                <th className="table-header">Muddat</th>
                <th className="table-header">Status</th>
                <th className="table-header">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-dark-400">Qarz topilmadi</td></tr>
              ) : (
                paginated.map((credit) => {
                  const overdue = credit.status !== "To'liq to'langan" && credit.status !== 'Qaytarilgan' && isOverdue(credit.dueDate);
                  const isReturned = credit.status === 'Qaytarilgan';
                  return (
                    <tr key={credit.id} className={`table-row ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isReturned ? 'opacity-60' : ''}`}>
                      <td className="table-cell">
                        <p className={`font-medium ${isReturned ? 'line-through text-dark-400' : 'text-dark-900 dark:text-white'}`}>{credit.buyerName}</p>
                        <p className="text-xs text-dark-400">{credit.buyerPhone}</p>
                      </td>
                      <td className="table-cell">
                        <p>{credit.phoneName}</p>
                        <p className="text-xs font-mono text-dark-400">{credit.phoneImei}</p>
                      </td>
                      <td className="table-cell font-medium">
                        <p>{formatCurrency(credit.totalPrice, credit.currency)}</p>
                        {credit.months > 1 && <p className="text-[10px] text-dark-400 font-normal">{credit.months} oy x {formatCurrency(credit.monthlyPaymentAmount, credit.currency)}</p>}
                      </td>
                      <td className="table-cell font-semibold text-red-600 dark:text-red-400">
                        {formatCurrency(credit.remainingDebt, credit.currency)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          {overdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                          <span className={overdue ? 'text-red-500' : ''}>{formatDate(credit.dueDate)}</span>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className={getDebtStatusBadge(credit.status)}>{credit.status}</span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          {credit.status !== "To'liq to'langan" && !isReturned && hasPermission('manage_credits') && (
                            <button
                              onClick={() => { setSelectedCredit(credit); rPay({ date: getTashkentDateString(), amount: credit.monthlyPaymentAmount || credit.remainingDebt }); setPayModalOpen(true); }}
                              className="btn-success text-xs px-2.5 py-1"
                            >
                              <DollarSign className="w-3.5 h-3.5" /> To'lov
                            </button>
                          )}
                          {!isReturned && hasPermission('manage_credits') && (
                            <button
                              onClick={() => { setSelectedCredit(credit); setReturnForm({ reason: '', refundAmount: 0, newPhoneStatus: 'Sotuvda' }); setReturnModalOpen(true); }}
                              className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 dark:bg-red-900/20"
                              title="Qaytarish"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {isReturned && (
                            <span className="text-[10px] text-red-500 font-medium italic">Qaytarilgan</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={ITEMS_PER_PAGE} />
      </div>

      {/* Add Credit Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Qarzga sotuv" size="lg">
        <form onSubmit={hCredit(onAddCredit)} className="space-y-4">
          <div>
            <label className="label">Telefon *</label>
            <select {...regCredit('phoneId')} className="input">
              <option value="">Tanlang...</option>
              {phones.map((p) => (
                <option key={p.id} value={p.id}>{p.brand} {p.model} – {p.imei}</option>
              ))}
            </select>
            {phones.length === 0 && !loading && (
              <p className="text-orange-500 text-xs mt-1">Sotuvda telefonlar mavjud emas. Avval telefon qo'shing.</p>
            )}
            {eCredit.phoneId && <p className="text-red-500 text-xs mt-1">{eCredit.phoneId.message}</p>}
            {watchPhoneId && phones.find(p => p.id === watchPhoneId) && (
              <div className="mt-1.5 p-2 bg-dark-50 dark:bg-dark-700 rounded-lg border border-dark-100 dark:border-dark-600">
                {(() => {
                  const p = phones.find(ph => ph.id === watchPhoneId);
                  return (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-dark-400">Xarid narxi: <span className="text-dark-900 dark:text-white font-medium">{watchCurrency === 'USD' ? formatCurrency(p.purchasePriceUSD, 'USD') : formatCurrency(p.purchasePriceUZS, 'UZS')}</span></span>
                      <span className="text-dark-400 font-mono">{p.imei}</span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Xaridor ismi *</label>
              <input {...regCredit('buyerName')} className="input" placeholder="Ism Familiya" />
              {eCredit.buyerName && <p className="text-red-500 text-xs mt-1">{eCredit.buyerName.message}</p>}
            </div>
            <div>
              <label className="label">Tel. raqam</label>
              <input {...regCredit('buyerPhone')} className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Naqd narxi ({watchCurrency}) *</label>
              <input {...regCredit('cashPrice', { valueAsNumber: true })} type="number" className="input" />
            </div>
            <div>
              <label className="label">Boshlang'ich to'lov (%)</label>
              <input 
                type="number" 
                className="input" 
                placeholder="Masalan: 40"
                onChange={(e) => {
                  const pct = Number(e.target.value) || 0;
                  setValue('initialPayment', (watchCashPrice || 0) * (pct / 100));
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Muddat (oy)</label>
              <select {...regCredit('months', { valueAsNumber: true })} className="input">
                {[1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 24].map(m => (
                  <option key={m} value={m}>{m} oy</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Qoldiqqa umumiy ustama (%)</label>
              <input {...regCredit('markupPercent', { valueAsNumber: true })} type="number" className="input" defaultValue={0} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Boshlang'ich to'lov (Summa)</label>
              <input {...regCredit('initialPayment', { valueAsNumber: true })} type="number" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label">Jami narx (Avtomat hisoblanadi)</label>
              <input {...regCredit('totalPrice', { valueAsNumber: true })} type="number" className="input" />
              {eCredit.totalPrice && <p className="text-red-500 text-xs mt-1">{eCredit.totalPrice.message}</p>}
            </div>
          </div>

          {watchMonths > 1 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800 flex justify-between items-center">
              <span className="text-blue-800 dark:text-blue-300 font-medium">Oylik to'lov:</span>
              <span className="text-xl font-bold text-blue-900 dark:text-blue-200">
                {formatCurrency(monthlyPaymentAmount, watchCurrency)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valyuta</label>
              <select {...regCredit('currency')} className="input">
                <option value="UZS">UZS (So'm)</option>
                <option value="USD">USD (Dollar)</option>
              </select>
            </div>
            <div>
              <label className="label">Sotuv sanasi</label>
              <input {...regCredit('saleDate')} type="date" className="input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Birinchi to'lov muddati (Avtomat)</label>
              <input {...regCredit('dueDate')} type="date" className="input bg-dark-50 dark:bg-dark-800/50 text-dark-400 cursor-not-allowed" readOnly />
              {eCredit.dueDate && <p className="text-red-500 text-xs mt-1">{eCredit.dueDate.message}</p>}
            </div>
            <div>
              <label className="label">Izoh</label>
              <textarea {...regCredit('notes')} className="input" rows={1} />
            </div>
          </div>

          {generatedSchedule.length > 0 && (
            <div>
              <p className="label">Kutilayotgan to'lov grafigi:</p>
              <div className="bg-dark-50 dark:bg-dark-700/50 rounded-lg p-3 text-xs space-y-1.5 max-h-40 overflow-y-auto">
                {generatedSchedule.map((s) => (
                  <div key={s.month} className="flex justify-between border-b border-dark-100 dark:border-dark-600 pb-1 last:border-0 last:pb-0">
                    <span className="text-dark-500">{s.month}-oy ({formatDate(s.date)})</span>
                    <span className="font-medium">{formatCurrency(s.amount, watchCurrency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setAddModalOpen(false)} className="btn-secondary">Bekor qilish</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal isOpen={payModalOpen} onClose={() => setPayModalOpen(false)} title="To'lov qabul qilish">
        {selectedCredit && (
          <div className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
              <p className="text-sm font-medium text-dark-900 dark:text-white">{selectedCredit.buyerName}</p>
              <p className="text-sm text-dark-400">{selectedCredit.phoneName}</p>
              <p className="text-lg font-bold text-red-600 mt-1">
                Qolgan qarz: {formatCurrency(selectedCredit.remainingDebt, selectedCredit.currency)}
              </p>
              {selectedCredit.months > 1 && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                  Tavsiya etilgan oylik to'lov: {formatCurrency(selectedCredit.monthlyPaymentAmount, selectedCredit.currency)}
                </p>
              )}
              {selectedCredit.paymentSchedule?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-dark-500 uppercase tracking-wider mb-2">To'lov grafigi</p>
                  <div className="space-y-1.5 bg-white dark:bg-dark-800 rounded-lg p-2 max-h-32 overflow-y-auto text-xs border border-dark-100 dark:border-dark-700">
                    {selectedCredit.paymentSchedule.map((s, idx) => (
                      <div key={idx} className="flex justify-between items-center pb-1 border-b border-dark-50 dark:border-dark-700 last:border-0 last:pb-0">
                        <span className="text-dark-600 dark:text-dark-300">{s.monthIndex}-oy: {formatDate(s.date)}</span>
                        <span className="font-medium text-dark-900 dark:text-white">{formatCurrency(s.amount, selectedCredit.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={hPay(onPayment)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">To'lov summasi ({selectedCredit.currency || 'UZS'}) *</label>
                  <input {...regPay('amount', { valueAsNumber: true })} type="number" className="input" />
                  {ePay.amount && <p className="text-red-500 text-xs mt-1">{ePay.amount.message}</p>}
                </div>
                <div>
                  <label className="label">Sana *</label>
                  <input {...regPay('date')} type="date" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Izoh</label>
                <input {...regPay('notes')} className="input" />
              </div>

              {/* Payment history */}
              {selectedCredit.paymentHistory?.length > 0 && (
                <div>
                  <p className="label">To'lovlar tarixi</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedCredit.paymentHistory.map((pay, i) => (
                      <div key={i} className="flex justify-between items-center bg-dark-50 dark:bg-dark-700 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs text-dark-400">{formatDate(pay.date)}</p>
                          {pay.notes && <p className="text-xs text-dark-500">{pay.notes}</p>}
                        </div>
                        <span className="text-sm font-medium text-green-600">{formatCurrency(pay.amount, selectedCredit.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setPayModalOpen(false)} className="btn-secondary">Bekor qilish</button>
                <button type="submit" disabled={submitting} className="btn-success">
                  {submitting ? 'Saqlanmoqda...' : 'To\'lovni tasdiqlash'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* Return Modal */}
      <Modal isOpen={returnModalOpen} onClose={() => setReturnModalOpen(false)} title="Tovarni qaytarib olish">
        {selectedCredit && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
              <p className="text-sm font-bold text-dark-900 dark:text-white">{selectedCredit.phoneName}</p>
              <p className="text-xs text-dark-400 mt-0.5">Xaridor: {selectedCredit.buyerName}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Qaytarish sababi</label>
                <textarea 
                  className="input" 
                  rows={2} 
                  value={returnForm.reason}
                  onChange={(e) => setReturnForm({...returnForm, reason: e.target.value})}
                  placeholder="Masalan: Ekranida nuqson bor..."
                />
              </div>

              <div>
                <label className="label">Qaytarilgan summa (agar bo'lsa)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={returnForm.refundAmount}
                  onChange={(e) => setReturnForm({...returnForm, refundAmount: Number(e.target.value)})}
                />
                <p className="text-[10px] text-dark-400 mt-1 italic">
                  * Agar mijozga pul qaytarib berilgan bo'lsa kiriting
                </p>
              </div>

              <div>
                <label className="label">Telefonning keyingi holati</label>
                <select 
                  className="input"
                  value={returnForm.newPhoneStatus}
                  onChange={(e) => setReturnForm({...returnForm, newPhoneStatus: e.target.value})}
                >
                  <option value="Sotuvda">Sotuvga qaytarish (Yangi kabi)</option>
                  <option value="Buzilgan">Buzilgan (Nosozlik bor)</option>
                  <option value="Servisda">Servisda (Tuzatishga berildi)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setReturnModalOpen(false)} className="btn-secondary">Bekor qilish</button>
                <button 
                  onClick={onReturn} 
                  disabled={submitting}
                  className="btn-primary bg-red-600 hover:bg-red-700 border-none"
                >
                  {submitting ? 'Saqlanmoqda...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CreditsPage;
