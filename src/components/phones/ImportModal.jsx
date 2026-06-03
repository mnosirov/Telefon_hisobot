import { useState, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { parseExcelFile } from '../../utils/excelParser';
import { extractTextFromPdf, parseTextContent } from '../../utils/pdfParser';
import { validateIMEI } from '../../utils/helpers';
import { BRANDS, CONDITIONS, COLORS, STORAGE_OPTIONS, RAM_OPTIONS } from '../../utils/constants';
import Modal from '../ui/Modal';
import toast from 'react-hot-toast';
import { Upload, FileText, Clipboard, AlertCircle, Check, Trash2, HelpCircle } from 'lucide-react';

const ImportModal = ({ isOpen, onClose, onImportSuccess }) => {
  const { currentUser, userProfile, logAction } = useAuth();
  const { usdRate } = useSettings();
  const shopId = userProfile?.shopId;

  const [activeTab, setActiveTab] = useState('file'); // 'file' or 'text'
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState([]); // array of parsed phones
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [rawText, setRawText] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      let phones = [];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
        phones = await parseExcelFile(file);
      } else if (extension === 'pdf') {
        const text = await extractTextFromPdf(file);
        phones = parseTextContent(text);
      } else {
        toast.error('Faqat Excel (.xlsx, .xls, .csv) yoki PDF (.pdf) fayllari qo\'llab-quvvatlanadi.');
        setLoading(false);
        return;
      }

      if (phones.length === 0) {
        toast.error('Fayldan telefon ma\'lumotlarini o\'qib bo\'lmadi. Jadval shaklini tekshiring.');
      } else {
        toast.success(`${phones.length} ta telefon topildi.`);
        setParsedData(phones);
        // Barchasini belgilash
        setSelectedIndices(phones.map((_, idx) => idx));
      }
    } catch (err) {
      console.error(err);
      toast.error('Faylni tahlil qilishda xato: ' + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTextParse = () => {
    if (!rawText.trim()) {
      toast.error('Matnni kiriting.');
      return;
    }
    setLoading(true);
    try {
      const phones = parseTextContent(rawText);
      if (phones.length === 0) {
        toast.error('Matndan telefon ma\'lumotlarini aniqlab bo\'lmadi. Har bir telefon yangi qatorda ekanligini tekshiring.');
      } else {
        toast.success(`${phones.length} ta telefon aniqlandi.`);
        setParsedData(phones);
        setSelectedIndices(phones.map((_, idx) => idx));
      }
    } catch (err) {
      toast.error('Matnni tahlil qilishda xato: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Uskuna ma'lumotlarini to'g'rilash
  const handleCellChange = (index, field, value) => {
    setParsedData(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      
      // Apple bo'lmaganda batareyani o'chirish
      if (field === 'brand' && value !== 'Apple') {
        delete updated[index].batteryHealth;
        delete updated[index].chargeCount;
      }
      // IMEI raqamlarni tozalash (faqat raqam)
      if (field === 'imei' || field === 'imei2') {
        updated[index][field] = String(value).replace(/\D/g, '').slice(0, 15);
      }
      // Narxni float qilish
      if (field === 'purchasePrice') {
        updated[index][field] = parseFloat(value) || 0;
      }

      return updated;
    });
  };

  const handleDeleteRow = (index) => {
    setParsedData(prev => prev.filter((_, idx) => idx !== index));
    setSelectedIndices(prev => prev.filter(idx => idx !== index).map(idx => idx > index ? idx - 1 : idx));
  };

  const handleSelectToggle = (index) => {
    setSelectedIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleSelectAllToggle = () => {
    if (selectedIndices.length === parsedData.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(parsedData.map((_, idx) => idx));
    }
  };

  // Har bir qator validatsiyasini tekshirish
  const validateRow = (phone) => {
    const isWifiTablet = phone.brand?.trim().replace(/\s+/g, ' ').toLowerCase() === 'wifi planshet';
    
    const errors = [];
    if (!phone.brand) errors.push('Brand kiritilmagan');
    if (!phone.model || phone.model === 'Model') errors.push('Model kiritilmagan');
    
    // IMEI check
    if (!isWifiTablet) {
      if (!phone.imei) errors.push('IMEI 1 kiritilmagan');
      else if (!validateIMEI(phone.imei)) errors.push('IMEI 1 noto\'g\'ri');
    }
    
    if (phone.imei2 && !validateIMEI(phone.imei2)) errors.push('IMEI 2 noto\'g\'ri');
    
    if (phone.purchasePrice <= 0) errors.push('Narx manfiy yoki 0');
    
    return errors;
  };

  const handleSaveImport = async () => {
    const selectedPhones = parsedData.filter((_, idx) => selectedIndices.includes(idx));
    if (selectedPhones.length === 0) {
      toast.error('Import qilish uchun hech bo\'lmasa bitta telefonni tanlang.');
      return;
    }

    // Barcha tanlanganlarni validatsiya qilish
    let hasError = false;
    for (const phone of selectedPhones) {
      const errors = validateRow(phone);
      if (errors.length > 0) {
        toast.error(`"${phone.brand} ${phone.model}" telefonda xatolik bor: ${errors.join(', ')}`);
        hasError = true;
        break;
      }
    }
    if (hasError) return;

    setLoading(true);
    let successCount = 0;
    try {
      const rate = usdRate || 12700;
      
      // Barcha telefonlarni Firestore-ga ketma-ket yozish
      for (const phone of selectedPhones) {
        const cleanImei = phone.imei?.replace(/\D/g, '') || '';
        const cleanImei2 = phone.imei2?.replace(/\D/g, '') || '';
        
        const purchasePriceUSD = Number(phone.purchasePrice) || 0;
        const purchasePriceUZS = purchasePriceUSD * rate;

        const payload = {
          ...phone,
          imei: cleanImei,
          imei2: cleanImei2,
          shopId,
          purchasePriceUSD,
          purchasePriceUZS,
          usdRate: rate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Undefined qiymatlarni o'chirish
        Object.keys(payload).forEach(key => {
          if (payload[key] === undefined) delete payload[key];
        });

        const newRef = await addDoc(collection(db, 'phones'), payload);
        
        // Yetkazib beruvchini kontaktlarga qo'shish (agar nomi kiritilgan bo'lsa)
        if (phone.supplierName) {
          // Oddiy importda har doim bazaga yangi yetkazib beruvchi qo'shilmasligi uchun,
          // istalgancha avval mavjudligini tekshirishni bu yerda chetlab o'tamiz (yoki ContactsPage orqali qilinadi)
        }

        await logAction(currentUser.uid, 'phone_added_bulk', { phoneId: newRef.id, model: phone.model });
        successCount++;
      }

      toast.success(`${successCount} ta telefon muvaffaqiyatli import qilindi!`);
      setParsedData([]);
      setSelectedIndices([]);
      setRawText('');
      onImportSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Import yozish jarayonida xatolik: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Telefonlar ro'yxatini import qilish"
      size="full"
    >
      <div className="space-y-4">
        {/* Tushuntirish / Yordam */}
        <div className="flex items-center justify-between bg-dark-50 dark:bg-dark-700/30 p-3 rounded-xl border border-dark-100 dark:border-dark-700">
          <div className="flex items-center gap-2 text-sm text-dark-600 dark:text-dark-300">
            <AlertCircle className="w-5 h-5 text-primary-500 flex-shrink-0" />
            <span>Excel jadvalini yuklang, PDF hisobotni tanlang yoki shunchaki ro'yxat matnini nusxalash orqali barcha telefonlarni ommaviy kiriting.</span>
          </div>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="text-xs text-primary-500 font-semibold hover:underline flex items-center gap-1"
          >
            <HelpCircle className="w-4 h-4" />
            {showHelp ? "Yordamni yopish" : "Shablon yordami"}
          </button>
        </div>

        {showHelp && (
          <div className="card p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900 text-xs text-dark-600 dark:text-dark-300 space-y-2 leading-relaxed">
            <h4 className="font-bold text-indigo-900 dark:text-indigo-400 text-sm">Fayl shabloniga qo'yiladigan talablar:</h4>
            <p><strong>Excel/CSV format:</strong> Jadvalning birinchi ustunlarida quyidagi sarlavhalar bo'lishi tavsiya etiladi (istalgan tartibda):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><code>Brand</code> (Samsung, Apple, Huawei, va h.k.)</li>
              <li><code>Model</code> (iPhone 15 Pro, Galaxy S24)</li>
              <li><code>IMEI 1</code> (15 xonali raqam)</li>
              <li><code>IMEI 2</code> (ixtiyoriy)</li>
              <li><code>Narx</code> (USD valyutasida, masalan: 550)</li>
              <li><code>Xotira</code> (128GB, 256GB va h.k.)</li>
              <li><code>Holat</code> (Yangi yoki Ishlatilgan)</li>
              <li><code>Rang</code>, <code>RAM</code>, <code>Yetkazib beruvchi</code> (ixtiyoriy)</li>
            </ul>
            <p className="mt-2"><strong>PDF yoki Matn formati:</strong> Har bir telefon yangi satrda bo'lishi kerak. Bizning aqlli algoritm satr ichidan Brand, Model, IMEI (15 ta raqam), Xotira, RAM, Rang va Narxlarni ($ belgisi orqali) avtomatik ajratib oladi.</p>
          </div>
        )}

        {/* Tablar */}
        {parsedData.length === 0 && (
          <div className="flex border-b border-dark-100 dark:border-dark-700">
            <button
              onClick={() => setActiveTab('file')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'file' ? 'border-primary-500 text-primary-500' : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              Fayl yuklash (Excel, CSV, PDF)
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'text' ? 'border-primary-500 text-primary-500' : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              <Clipboard className="w-4 h-4" />
              Matndan import (Copy-Paste)
            </button>
          </div>
        )}

        {/* Ma'lumot yo'qligida Yuklash oynasi */}
        {parsedData.length === 0 && (
          <div>
            {activeTab === 'file' ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-2xl p-12 text-center hover:border-primary-500 dark:hover:border-primary-500 hover:bg-dark-50 dark:hover:bg-dark-800/20 cursor-pointer transition-all space-y-3"
              >
                <div className="w-16 h-16 bg-primary-50 dark:bg-primary-950/20 text-primary-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-dark-900 dark:text-white">Excel, CSV yoki PDF faylni tanlang</p>
                  <p className="text-xs text-dark-400 mt-1">Yoki faylni sudrab bu yerga tashlang</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv,.pdf"
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Telefonlar ro'yxatini kiriting (har bir telefon yangi qatorda)</label>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={8}
                    placeholder={`Samsung Galaxy S23 128GB Black IMEI:351234567890123 Narxi:$650
iPhone 14 Pro Max 256GB Silver IMEI:359876543210987 Narxi:$950 Yangi`}
                    className="input font-mono text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTextParse}
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Matnni tahlil qilish
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ma'lumot o'qilgandagi Preview / Jadval oynasi */}
        {parsedData.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-dark-50 dark:bg-dark-800/40 p-4 rounded-xl border border-dark-100 dark:border-dark-700">
              <div>
                <h3 className="text-sm font-bold text-dark-900 dark:text-white">Tahlil qilingan telefonlar</h3>
                <p className="text-xs text-dark-400 mt-0.5">
                  Jami: {parsedData.length} ta | Tanlandi: {selectedIndices.length} ta
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setParsedData([]); setSelectedIndices([]); }}
                  className="btn-secondary text-xs"
                >
                  Qayta fayl tanlash
                </button>
                <button
                  onClick={handleSaveImport}
                  disabled={loading}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {loading ? 'Import qilinmoqda...' : `Tanlanganlarni import qilish (${selectedIndices.length})`}
                </button>
              </div>
            </div>

            {/* Preview Table */}
            <div className="card overflow-hidden border border-dark-100 dark:border-dark-700">
              <div className="overflow-x-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-dark-50 dark:bg-dark-800 text-[10px] uppercase font-bold text-dark-400 border-b border-dark-100 dark:border-dark-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={parsedData.length > 0 && selectedIndices.length === parsedData.length}
                          onChange={handleSelectAllToggle}
                          className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
                        />
                      </th>
                      <th className="p-3 min-w-[120px]">Brand *</th>
                      <th className="p-3 min-w-[160px]">Model *</th>
                      <th className="p-3 min-w-[150px]">IMEI 1 *</th>
                      <th className="p-3 min-w-[150px]">IMEI 2</th>
                      <th className="p-3 min-w-[100px]">Xarid (USD) *</th>
                      <th className="p-3 min-w-[90px]">Holat</th>
                      <th className="p-3 min-w-[90px]">Rang</th>
                      <th className="p-3 min-w-[90px]">Xotira</th>
                      <th className="p-3 min-w-[90px]">RAM</th>
                      <th className="p-3 min-w-[90px]">UZIMEI</th>
                      <th className="p-3 min-w-[120px]">Yetkazib beruvchi</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-50 dark:divide-dark-700">
                    {parsedData.map((phone, idx) => {
                      const errors = validateRow(phone);
                      const isSelected = selectedIndices.includes(idx);
                      const isApple = phone.brand === 'Apple';
                      const isWifiTablet = phone.brand?.trim().replace(/\s+/g, ' ').toLowerCase() === 'wifi planshet';

                      return (
                        <tr 
                          key={idx} 
                          className={`table-row text-xs transition-colors ${
                            !isSelected ? 'opacity-50' : ''
                          } ${errors.length > 0 && isSelected ? 'bg-red-50/20 dark:bg-red-950/10' : ''}`}
                        >
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectToggle(idx)}
                              className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
                            />
                          </td>
                          {/* Brand */}
                          <td className="p-1">
                            <select
                              value={phone.brand}
                              onChange={(e) => handleCellChange(idx, 'brand', e.target.value)}
                              className={`w-full px-2 py-1 border rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                !phone.brand ? 'border-red-500' : 'border-dark-200 dark:border-dark-700'
                              }`}
                            >
                              <option value="">Tanlang</option>
                              {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </td>
                          {/* Model */}
                          <td className="p-1">
                            <input
                              type="text"
                              value={phone.model}
                              onChange={(e) => handleCellChange(idx, 'model', e.target.value)}
                              className={`w-full px-2 py-1 border rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                !phone.model || phone.model === 'Model' ? 'border-red-500' : 'border-dark-200 dark:border-dark-700'
                              }`}
                            />
                          </td>
                          {/* IMEI 1 */}
                          <td className="p-1">
                            <input
                              type="text"
                              value={phone.imei}
                              onChange={(e) => handleCellChange(idx, 'imei', e.target.value)}
                              className={`w-full px-2 py-1 border rounded bg-white dark:bg-dark-800 font-mono text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                !isWifiTablet && (!phone.imei || !validateIMEI(phone.imei)) ? 'border-red-500 text-red-500' : 'border-dark-200 dark:border-dark-700'
                              }`}
                              placeholder={isWifiTablet ? 'ixtiyoriy' : '35...'}
                            />
                          </td>
                          {/* IMEI 2 */}
                          <td className="p-1">
                            <input
                              type="text"
                              value={phone.imei2}
                              onChange={(e) => handleCellChange(idx, 'imei2', e.target.value)}
                              className={`w-full px-2 py-1 border rounded bg-white dark:bg-dark-800 font-mono text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                phone.imei2 && !validateIMEI(phone.imei2) ? 'border-red-500 text-red-500' : 'border-dark-200 dark:border-dark-700'
                              }`}
                              placeholder="ixtiyoriy"
                            />
                          </td>
                          {/* Price */}
                          <td className="p-1">
                            <div className="relative">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-green-600 font-bold">$</span>
                              <input
                                type="number"
                                value={phone.purchasePrice}
                                onChange={(e) => handleCellChange(idx, 'purchasePrice', e.target.value)}
                                className={`w-full pl-4 pr-1 py-1 border rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                  phone.purchasePrice <= 0 ? 'border-red-500' : 'border-dark-200 dark:border-dark-700'
                                }`}
                                step="0.01"
                              />
                            </div>
                          </td>
                          {/* Condition */}
                          <td className="p-1">
                            <select
                              value={phone.condition}
                              onChange={(e) => handleCellChange(idx, 'condition', e.target.value)}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          {/* Color */}
                          <td className="p-1">
                            <select
                              value={phone.color}
                              onChange={(e) => handleCellChange(idx, 'color', e.target.value)}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="">Rang</option>
                              {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          {/* Storage */}
                          <td className="p-1">
                            <select
                              value={phone.storageSize}
                              onChange={(e) => handleCellChange(idx, 'storageSize', e.target.value)}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="">Xotira</option>
                              {STORAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          {/* RAM */}
                          <td className="p-1">
                            <select
                              value={phone.ram}
                              onChange={(e) => handleCellChange(idx, 'ram', e.target.value)}
                              disabled={isApple}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:bg-dark-100 dark:disabled:bg-dark-700"
                            >
                              <option value="">RAM</option>
                              {RAM_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                          {/* UZIMEI */}
                          <td className="p-1">
                            <select
                              value={phone.uzimei}
                              onChange={(e) => handleCellChange(idx, 'uzimei', e.target.value)}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="O'tmagan">O'tmagan</option>
                              <option value="Ikkalasi o'tgan">Ikkalasi o'tgan</option>
                              <option value="Faqat IMEI 1 o'tgan">Faqat IMEI 1 o'tgan</option>
                              <option value="Faqat IMEI 2 o'tgan">Faqat IMEI 2 o'tgan</option>
                            </select>
                          </td>
                          {/* Supplier */}
                          <td className="p-1">
                            <input
                              type="text"
                              value={phone.supplierName}
                              onChange={(e) => handleCellChange(idx, 'supplierName', e.target.value)}
                              className="w-full px-2 py-1 border border-dark-200 dark:border-dark-700 rounded bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                              placeholder="Yetkazib beruvchi"
                            />
                          </td>
                          {/* Action */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(idx)}
                              className="p-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 hover:dark:bg-red-900/30 text-red-600 rounded transition-colors"
                              title="O'chirish"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedIndices.some(idx => validateRow(parsedData[idx]).length > 0) && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg border border-red-200 dark:border-red-900">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Tanlangan telefonlarda xatolik bor (qizil rangda belgilangan). Iltimos, davom etishdan oldin ularni tuzating yoki jadvaldan o'chirib yuboring.</span>
              </div>
            )}
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="fixed inset-0 bg-dark-950/50 backdrop-blur-sm z-[110] flex items-center justify-center">
            <div className="bg-white dark:bg-dark-900 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 text-center max-w-xs">
              <span className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
              <div>
                <p className="font-bold text-dark-900 dark:text-white">Iltimos kuting</p>
                <p className="text-xs text-dark-400 mt-1">Ma'lumotlar qayta ishlanmoqda...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ImportModal;
