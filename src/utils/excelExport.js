import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatDate } from './helpers';

/**
 * Generates an Excel report for a specific shop containing sales, credits, contacts, expenses, returns, and inventory.
 * @param {string} shopId - The ID of the shop.
 * @param {string} shopName - The name of the shop for the filename.
 */
export const generateShopExcelReport = async (shopId, shopName) => {
  try {
    // 1. Fetch Sales
    const salesSnap = await getDocs(
      query(
        collection(db, 'sales'),
        where('shopId', '==', shopId),
        orderBy('saleDate', 'desc')
      )
    );
    const salesData = salesSnap.docs.map(doc => {
      const d = doc.data();
      return {
        'Sana': formatDate(d.saleDate),
        'Model': d.phoneName || '—',
        'IMEI': d.phoneImei || '—',
        'Mijoz': d.buyerName || '—',
        'Telefon': d.buyerPhone || '—',
        'Narxi': d.salePriceUZS || 0,
        'Sotuv turi': d.paymentMethod || 'Naqd',
        'To\'lov turi': d.paymentMethod || 'Naqd',
        'Foyda': d.profit || 0,
        'Sotuvchi': d.sellerName || '—'
      };
    });

    // 2. Fetch Credits (Debts)
    const creditsSnap = await getDocs(
      query(
        collection(db, 'credits'),
        where('shopId', '==', shopId),
        orderBy('createdAt', 'desc')
      )
    );
    const debtsData = creditsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        'Sana': formatDate(d.saleDate || d.createdAt),
        'Model': d.phoneName || '—',
        'IMEI': d.phoneImei || '—',
        'Mijoz': d.buyerName || '—',
        'Telefon': d.buyerPhone || '—',
        'Jami narx': d.totalPrice || 0,
        'Boshlang\'ich': d.initialPayment || 0,
        'Qolgan qarz': d.remainingDebt || 0,
        'Muddat': formatDate(d.dueDate),
        'Status': d.status || '—'
      };
    });

    // 3. Fetch Contacts (Customers)
    const contactsSnap = await getDocs(
      query(
        collection(db, 'contacts'),
        where('shopId', '==', shopId),
        orderBy('createdAt', 'desc')
      )
    );
    const contactsData = contactsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        'Foydalanuvchi': d.name || '—',
        'Telefon': d.phone || '—',
        'Turi': d.type === 'buyer' ? 'Xaridor' : d.type === 'supplier' ? 'Ta\'minotchi' : d.type || '—',
        'Qo\'shilgan sana': formatDate(d.createdAt)
      };
    });

    // 4. Fetch Expenses
    const expensesSnap = await getDocs(
      query(
        collection(db, 'expenses'),
        where('shopId', '==', shopId),
        orderBy('date', 'desc')
      )
    );
    const expensesData = expensesSnap.docs.map(doc => {
      const d = doc.data();
      return {
        'Sana': formatDate(d.date),
        'Nomi': d.title || '—',
        'Turi': d.category || '—',
        'Summa': d.amount || 0,
        'Izoh': d.notes || '—'
      };
    });

    // 5. Fetch Returns
    const returnsSnap = await getDocs(
      query(
        collection(db, 'returns'),
        where('shopId', '==', shopId),
        orderBy('returnedAt', 'desc')
      )
    );
    const returnsData = returnsSnap.docs.map(doc => {
      const d = doc.data();
      return {
        'Sana': formatDate(d.returnedAt),
        'Model': d.phoneName || '—',
        'IMEI': d.phoneImei || '—',
        'Mijoz': d.buyerName || '—',
        'Sabab': d.reason || '—',
        'Qaytarilgan summa': d.refundAmount || 0,
        'Yangi holati': d.newPhoneStatus || '—'
      };
    });

    // 6. Fetch Inventory (Phones)
    const phonesSnap = await getDocs(
      query(
        collection(db, 'phones'),
        where('shopId', '==', shopId)
      )
    );
    const phonesData = phonesSnap.docs
      .map(doc => doc.data())
      .filter(d => d.isDeleted !== true) // Filter out deleted ones, include those where isDeleted is missing
      .map(d => {
        return {
          'Brand': d.brand || '—',
          'Model': d.model || '—',
          'IMEI': d.imei || '—',
          'IMEI 2': d.imei2 || '—',
          'Yetkazib beruvchi': d.supplierName || '—',
          'Xarid narxi ($)': d.purchasePriceUSD || 0,
          'Xarid narxi (so\'m)': d.purchasePriceUZS || 0,
          'Xarid sanasi': d.purchaseDate || formatDate(d.createdAt),
          'Holati': d.condition || '—',
          'Status': d.status || '—',
          'Karobka': d.hasBox ? 'Bor' : 'Yo\'q'
        };
      });

    // 7. Create Workbook
    const wb = XLSX.utils.book_new();

    // Add Sheets
    const addSheet = (data, name) => {
      const ws = data.length > 0 ? XLSX.utils.json_to_sheet(data) : XLSX.utils.json_to_sheet([{ 'Xabar': 'Ma\'lumot topilmadi' }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet(salesData, 'Sotuvlar');
    addSheet(debtsData, 'Qarzlar');
    addSheet(contactsData, 'Mijozlar');
    addSheet(expensesData, 'Xarajatlar');
    addSheet(returnsData, 'Qaytarishlar');
    addSheet(phonesData, 'Ombor (Telefonlar)');

    // 8. Generate and Save File
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    
    const fileName = `${shopName.replace(/\s+/g, '_')}_Hisobot_${new Date().toISOString().split('T')[0]}.xlsx`;
    saveAs(blob, fileName);

    return true;
  } catch (error) {
    console.error('Excel export error:', error);
    throw error;
  }
};
