import * as XLSX from 'xlsx';
import { BRANDS, COLORS, STORAGE_OPTIONS, RAM_OPTIONS } from './constants';
import { getTashkentDateString } from './helpers';

// Heuristik moslashtirish funktsiyalari
const findBrand = (val) => {
  if (!val) return '';
  const cleanVal = String(val).trim().toLowerCase();
  // "wifi planshet" maxsus brandini tekshirish
  if (cleanVal.includes('wifi planshet') || cleanVal.includes('wifi tablet')) {
    return 'Wifi planshet';
  }
  const matched = BRANDS.find(b => cleanVal === b.toLowerCase() || cleanVal.includes(b.toLowerCase()));
  return matched || '';
};

const findCondition = (val) => {
  if (!val) return 'Yangi';
  const cleanVal = String(val).trim().toLowerCase();
  if (cleanVal.includes('ishlatilgan') || cleanVal.includes('used') || cleanVal.includes('second') || cleanVal.includes('eski')) {
    return 'Ishlatilgan';
  }
  return 'Yangi';
};

const findColor = (val) => {
  if (!val) return '';
  const cleanVal = String(val).trim().toLowerCase();
  
  // Inglizcha ranglarni o'zbekchaga o'girish lug'ati
  const colorMap = {
    black: 'Qora',
    white: 'Oq',
    grey: 'Kulrang',
    gray: 'Kulrang',
    silver: 'Kumush',
    gold: 'Oltin',
    blue: 'Ko\'k',
    red: 'Qizil',
    green: 'Yashil',
    yellow: 'Sariq',
    orange: 'To\'q sariq',
    purple: 'Binafsha',
    pink: 'Pushti',
    brown: 'Jigarrang',
  };

  if (colorMap[cleanVal]) return colorMap[cleanVal];

  const matched = COLORS.find(c => cleanVal === c.toLowerCase() || cleanVal.includes(c.toLowerCase()));
  return matched || '';
};

const findStorage = (val) => {
  if (!val) return '';
  const cleanVal = String(val).trim().toUpperCase();
  const matched = STORAGE_OPTIONS.find(s => cleanVal.includes(s) || s.includes(cleanVal));
  if (matched) return matched;
  
  // Agar faqat raqam bo'lsa (masalan, 128), GB qo'shib tekshiramiz
  const numOnly = cleanVal.replace(/\D/g, '');
  if (numOnly) {
    const withGb = numOnly + 'GB';
    const found = STORAGE_OPTIONS.find(s => s === withGb);
    if (found) return found;
    if (numOnly === '1') return '1TB'; // 1TB holati
  }
  return '';
};

const findRam = (val) => {
  if (!val) return '';
  const cleanVal = String(val).trim().toUpperCase();
  const matched = RAM_OPTIONS.find(r => cleanVal.includes(r) || r.includes(cleanVal));
  if (matched) return matched;

  const numOnly = cleanVal.replace(/\D/g, '');
  if (numOnly) {
    const withGb = numOnly + 'GB';
    const found = RAM_OPTIONS.find(r => r === withGb);
    if (found) return found;
  }
  return '';
};

const findUzimei = (val) => {
  if (!val) return '';
  const cleanVal = String(val).trim().toLowerCase();
  if (cleanVal.includes('ikkalasi') || cleanVal.includes('both')) return 'Ikkalasi o\'tgan';
  if (cleanVal.includes('imei 1') || cleanVal.includes('imei1')) return 'Faqat IMEI 1 o\'tgan';
  if (cleanVal.includes('imei 2') || cleanVal.includes('imei2')) return 'Faqat IMEI 2 o\'tgan';
  if (cleanVal.includes('o\'tmagan') || cleanVal.includes('otmagan') || cleanVal.includes('no') || cleanVal.includes('not')) return 'O\'tmagan';
  return '';
};

const parseBoolean = (val) => {
  if (val === undefined || val === null) return true;
  const cleanVal = String(val).trim().toLowerCase();
  if (cleanVal === 'yo\'q' || cleanVal === 'yoq' || cleanVal === 'no' || cleanVal === 'false' || cleanVal === '0') return false;
  return true;
};

// BigInt va ilmiy formatdagi (scientific notation) IMEIlarni to'g'ri tozalash
const cleanImeiValue = (val) => {
  if (val === undefined || val === null || val === '') return '';
  
  if (typeof val === 'number') {
    if (isNaN(val)) return '';
    try {
      const str = val.toLocaleString('fullwide', { useGrouping: false });
      if (!str.includes('e') && !str.includes('E')) {
        return str.replace(/\D/g, '').slice(0, 15);
      }
      return BigInt(Math.round(val)).toString().slice(0, 15);
    } catch (e) {
      return String(Math.round(val)).replace(/\D/g, '').slice(0, 15);
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  if (/[eE][+-]?\d+/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      try {
        return BigInt(Math.round(num)).toString().slice(0, 15);
      } catch (e) {
        // fallback
      }
    }
  }

  return str.replace(/\D/g, '').slice(0, 15);
};

// Kalitlarni maydonlarga moslash jadvali (imei2 imei dan oldin kelishi kerak)
const columnMappings = {
  brand: ['brand', 'brend', 'firma', 'marka', 'производитель'],
  model: ['model', 'nomi', 'name', 'модель', 'название'],
  imei2: ['imei 2', 'imei2', 'imei-2', 'imei_2', 'imei (2)', 'имей 2', 'имей2', 'second imei', '2nd imei'],
  imei: ['imei 1', 'imei1', 'imei-1', 'imei_1', 'imei (1)', 'имей 1', 'имей1', 'imei', 'имей', 'imei kodi', 'imei kod', 'серийный', 'serial', 'sn', 's/n'],
  condition: ['condition', 'holat', 'holati', 'состояние'],
  color: ['color', 'rang', 'rangi', 'цвет'],
  storageSize: ['storage', 'xotira', 'xotirasi', 'память', 'storage size'],
  ram: ['ram', 'ozu', 'operativka', 'ram (ozu)', 'оперативная память'],
  batteryHealth: ['battery', 'batareka', 'batareya', 'akb', 'health', 'емкость'],
  chargeCount: ['charge', 'charge count', 'zaryad', 'zaryadlar soni', 'cycles', 'циклы'],
  hasBox: ['box', 'karobka', 'karobkasi', 'box/box', 'коробка'],
  // USD ustunlari — USTUVOR (purchasePrice dan oldin joylashgan)
  purchasePriceUSD: ['price usd', 'narx usd', 'narxi usd', 'usd narx', 'dollar narx', 'dollar price', 'xarid narxi usd', 'usd price'],
  // UZS ustunlari — E'TIBORGA OLINMAYDI (tizim faqat USD ishlaydi)
  purchasePriceUZS: ["price uzs", "narx uzs", "narxi uzs", "uzs narx", "so'm narx", "som narx", "sum narx", "narx (so'm)", "narx (uzs)"],
  // Umumiy narx ustuni — UZS belgisi bo'lmasa USD deb qabul qilinadi
  purchasePrice: ['price', 'narx', 'narxi', 'cost', 'purchase price', 'цена', 'xarid narxi'],
  supplierName: ['supplier', 'yetkazib beruvchi', 'postavshik', 'поставщик'],
  supplierPhone: ['phone', 'tel', 'telefon', 'nomer', 'supplier phone'],
  purchaseDate: ['date', 'sana', 'xarid sanasi', 'дата'],
  uzimei: ['uzimei', 'uzimei holati', 'регистрация']
};

// Excel sana serial raqamini yoki Date obyektini "YYYY-MM-DD" formatiga o'giradi
const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    // Excel serial: 1 = 1900-01-01, Unix epoch farqi 25569 kun
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const date = new Date(ms);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  return str || null;
};

// Katak qiymatidan UZS belgilari bo'lsa null, aks holda raqam qaytaradi
const parsePriceAsUSD = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  // UZS belgilari bo'lsa — e'tiborsiz qoldirish
  if (/so['']?m|uzs|\bsum\b|сум/i.test(str)) return null;
  const num = parseFloat(str.replace(/[^\d.]/g, ''));
  return isNaN(num) ? null : num;
};

const getMappedKey = (header) => {
  if (!header) return null;
  const cleanHeader = String(header).trim().toLowerCase().replace(/[_\-\/\(\):]/g, ' ').replace(/\s+/g, ' ');

  // 1-bosqich: Aniq moslik (Exact match)
  for (const [key, aliases] of Object.entries(columnMappings)) {
    if (aliases.some(alias => cleanHeader === alias)) {
      return key;
    }
  }

  // 2-bosqich: Qisman moslik (Includes match)
  for (const [key, aliases] of Object.entries(columnMappings)) {
    if (aliases.some(alias => cleanHeader.includes(alias))) {
      return key;
    }
  }

  return null;
};

export const parseExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Hamma qatorlarni o'qish (raw formatda)
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length === 0) {
          resolve([]);
          return;
        }

        // Sarlavhani topish (odatda birinchi bo'sh bo'lmagan qator)
        let headerRowIndex = 0;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].length > 0 && rows[i].some(cell => cell !== null && cell !== '')) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rows[headerRowIndex].map(h => String(h || '').trim());
        const mappedFields = headers.map(h => getMappedKey(h));

        const parsedPhones = [];

        // Ma'lumotlarni o'qish
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0 || row.every(cell => cell === null || cell === '')) {
            continue; // bo'sh qatorlar
          }

          const rawPhone = {};
          row.forEach((cell, index) => {
            const field = mappedFields[index];
            if (field) {
              rawPhone[field] = cell;
            }
          });

          // Maydonlarni tozalash va standartlashtirish
          const brand = findBrand(rawPhone.brand);
          const model = String(rawPhone.model || '').trim();
          
          if (!brand && !model) continue; // Brand va Model bo'lmasa qatorni tashlab ketamiz

          // Narxni hisoblash — FAQAT USD qabul qilinadi
          // Ustuvorlik: purchasePriceUSD ustuni > purchasePrice (UZS belgisi yo'q) > 0
          let price = 0;
          if (rawPhone.purchasePriceUSD !== undefined) {
            price = parseFloat(String(rawPhone.purchasePriceUSD || '').replace(/[^\d.]/g, '')) || 0;
          } else if (rawPhone.purchasePrice !== undefined) {
            const parsed = parsePriceAsUSD(rawPhone.purchasePrice);
            price = parsed !== null ? parsed : 0;
          }
          // purchasePriceUZS ustuni bo'lsa — e'tiborga olinmaydi

          const phone = {
            brand: brand || 'Samsung', // Default brand
            model: model || 'Noma\'lum model',
            imei: cleanImeiValue(rawPhone.imei),
            imei2: cleanImeiValue(rawPhone.imei2),
            condition: findCondition(rawPhone.condition),
            color: findColor(rawPhone.color),
            storageSize: findStorage(rawPhone.storageSize),
            ram: findRam(rawPhone.ram),
            batteryHealth: rawPhone.batteryHealth !== undefined && rawPhone.batteryHealth !== null ? parseInt(String(rawPhone.batteryHealth).replace(/\D/g, '')) : undefined,
            chargeCount: rawPhone.chargeCount !== undefined && rawPhone.chargeCount !== null ? parseInt(String(rawPhone.chargeCount).replace(/\D/g, '')) : undefined,
            hasBox: parseBoolean(rawPhone.hasBox),
            purchasePrice: price, // Formada ko'rsatish uchun
            supplierName: String(rawPhone.supplierName || '').trim(),
            supplierPhone: String(rawPhone.supplierPhone || '').trim(),
            purchaseDate: parseExcelDate(rawPhone.purchaseDate) || getTashkentDateString(),
            uzimei: findUzimei(rawPhone.uzimei) || 'O\'tmagan',
            status: 'Sotuvda',
            isArchived: false,
            isDeleted: false,
          };

          // Tozalash: Apple bo'lmaganda batareya maydonlarini olib tashlaymiz
          if (phone.brand !== 'Apple') {
            delete phone.batteryHealth;
            delete phone.chargeCount;
          }

          parsedPhones.push(phone);
        }

        resolve(parsedPhones);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
