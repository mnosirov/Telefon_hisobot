import { BRANDS, COLORS, STORAGE_OPTIONS, RAM_OPTIONS } from './constants';
import { getTashkentDateString } from './helpers';

// PDF.js dinamik yuklash
const loadPdfJs = () => {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      // PDF.js global obyektini sozlash
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      window.pdfjsLib = pdfjsLib;
      resolve(pdfjsLib);
    };
    script.onerror = (err) => reject(new Error('PDF.js yuklashda xatolik: ' + err.message));
    document.head.appendChild(script);
  });
};

// PDF fayldan matn ajratib olish
export const extractTextFromPdf = async (file) => {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Satrlarni Y-koordinatalar bo'yicha guruhlash
    let lastY;
    let pageText = '';
    
    for (let item of textContent.items) {
      // Yangi satrga o'tishni tekshirish
      if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += '\n';
      }
      pageText += item.str + ' ';
      lastY = item.transform[5];
    }
    
    fullText += pageText + '\n';
  }
  
  return fullText;
};

// Matn satrini tahlil qilish (Heuristik parser)
export const parseTextLine = (line) => {
  const cleanLine = line.trim();
  if (!cleanLine) return null;

  // 1. IMEI 1 va IMEI 2 topish (15 xonali raqamlar)
  const imeiRegex = /\b\d{15}\b/g;
  const imeis = cleanLine.match(imeiRegex) || [];
  const imei = imeis[0] || '';
  const imei2 = imeis[1] || '';

  // 2. Brand topish
  let brand = '';
  const brandAliases = {
    'iphone': 'Apple',
    'ipad': 'Apple',
    'redmi': 'Xiaomi',
    'poco': 'Xiaomi',
    'mi': 'Xiaomi',
    'galaxy': 'Samsung',
  };

  if (cleanLine.toLowerCase().includes('wifi planshet') || cleanLine.toLowerCase().includes('wifi tablet')) {
    brand = 'Wifi planshet';
  } else {
    // Avval taxalluslarni tekshirish
    for (const [alias, realBrand] of Object.entries(brandAliases)) {
      const aliasRegex = new RegExp('\\b' + alias + '\\b', 'i');
      if (aliasRegex.test(cleanLine)) {
        brand = realBrand;
        break;
      }
    }
    // Keyin asosiy brandlarni tekshirish
    if (!brand) {
      const matchedBrand = BRANDS.find(b => {
        const brandRegex = new RegExp('\\b' + b + '\\b', 'i');
        return brandRegex.test(cleanLine);
      });
      if (matchedBrand) {
        brand = matchedBrand;
      }
    }
  }

  // 3. Xotira hajmini topish (GB/TB) - 1 tadan 4 tagacha raqamlar
  const storageRegex = /\b(\d{1,4})\s*(?:GB|gb|Gb|TB|tb|Tb)\b/g;
  const storageMatches = cleanLine.match(storageRegex) || [];
  let storageSize = '';
  let ram = '';

  storageMatches.forEach(match => {
    const upperMatch = match.toUpperCase().replace(/\s+/g, '');
    const size = parseInt(match);
    if (RAM_OPTIONS.some(r => r === upperMatch) && size < 32) {
      ram = upperMatch;
    } else if (STORAGE_OPTIONS.some(s => s === upperMatch)) {
      storageSize = upperMatch;
    }
  });

  if (!ram) {
    const ramRegex = /\b(ram|ozu|озу)\s*[:=]?\s*(\d{1,2})\b/i;
    const ramMatch = cleanLine.match(ramRegex);
    if (ramMatch) {
      const size = ramMatch[2] + 'GB';
      if (RAM_OPTIONS.includes(size)) {
        ram = size;
      }
    }
  }

  // 4. Rangni topish
  let color = '';
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

  for (const [eng, uz] of Object.entries(colorMap)) {
    const regex = new RegExp('\\b' + eng + '\\b', 'i');
    if (regex.test(cleanLine)) {
      color = uz;
      break;
    }
  }

  if (!color) {
    const matchedColor = COLORS.find(c => {
      const cleanC = c.replace("'", "");
      const regex = new RegExp('\\b' + cleanC + '\\b', 'i');
      return regex.test(cleanLine);
    });
    if (matchedColor) {
      color = matchedColor;
    }
  }

  // 5. Holat (Condition)
  let condition = 'Yangi';
  if (/\b(?:ishlatilgan|used|second|eski)\b/i.test(cleanLine)) {
    condition = 'Ishlatilgan';
  }

  // 6. UZIMEI holati
  let uzimei = 'O\'tmagan';
  if (/\b(?:ikkalasi|both)\b/i.test(cleanLine)) {
    uzimei = 'Ikkalasi o\'tgan';
  } else if (/\b(?:imei 1|imei1)\b/i.test(cleanLine)) {
    uzimei = 'Faqat IMEI 1 o\'tgan';
  } else if (/\b(?:imei 2|imei2)\b/i.test(cleanLine)) {
    uzimei = 'Faqat IMEI 2 o\'tgan';
  }

  // 7. Sanani topish (YYYY-MM-DD yoki DD.MM.YYYY)
  const dateRegex = /\b(\d{4}-\d{2}-\d{2})|(\d{2}\.\d{2}\.\d{4})\b/;
  const dateMatch = cleanLine.match(dateRegex);
  let purchaseDate = getTashkentDateString();
  if (dateMatch) {
    purchaseDate = dateMatch[0];
  }

  // 8. Narxni topish (USD)
  let purchasePrice = 0;
  let matchedPriceText = '';
  const usdRegex = /(?:\$|usd)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:\$|usd)/i;
  const usdMatch = cleanLine.match(usdRegex);
  
  const uzsRegex = /(\d+[\s.]?\d+[\s.]?\d+)\s*(?:so'm|som|uzs|sum)/i;
  const uzsMatch = cleanLine.match(uzsRegex);

  if (usdMatch) {
    purchasePrice = parseFloat(usdMatch[1] || usdMatch[2]) || 0;
    matchedPriceText = usdMatch[0];
  } else if (uzsMatch) {
    const rawUzs = parseFloat(uzsMatch[1].replace(/[\s.]/g, '')) || 0;
    purchasePrice = Math.round((rawUzs / 12700) * 100) / 100;
    matchedPriceText = uzsMatch[0];
  } else {
    const numbers = cleanLine.match(/\b\d+(?:\.\d+)?\b/g) || [];
    for (const numStr of numbers) {
      const num = parseFloat(numStr);
      if (num >= 50 && num <= 3000 && !storageMatches.some(m => m.includes(numStr)) && numStr.length !== 15 && numStr.length !== 4) {
        purchasePrice = num;
        matchedPriceText = numStr;
        break;
      }
    }
  }

  // 9. Modelni aniqlash
  let modelText = cleanLine;

  // IMEI o'chirish
  imeis.forEach(im => { modelText = modelText.replace(im, ''); });
  
  // Hamma brandlarni o'chirish
  BRANDS.forEach(b => {
    const regex = new RegExp('\\b' + b + '\\b', 'gi');
    modelText = modelText.replace(regex, '');
  });
  
  // Hamma brand taxalluslarini o'chirish
  Object.keys(brandAliases).forEach(alias => {
    const regex = new RegExp('\\b' + alias + '\\b', 'gi');
    modelText = modelText.replace(regex, '');
  });

  // planshet so'zlarini ham o'chirish
  modelText = modelText.replace(/\b(?:planshet|tablet|wifi)\b/gi, '');

  // Hamma xotiralarni o'chirish
  storageMatches.forEach(st => { modelText = modelText.replace(st, ''); });
  
  if (ram) {
    const ramRegexInsensitive = new RegExp('\\b' + ram + '\\b', 'gi');
    modelText = modelText.replace(ramRegexInsensitive, '');
  }
  if (dateMatch) {
    modelText = modelText.replace(dateMatch[0], '');
  }
  if (matchedPriceText) {
    modelText = modelText.replace(matchedPriceText, '');
  }
  
  // Inglizcha ranglarni o'chirish
  Object.keys(colorMap).forEach(eng => {
    const regex = new RegExp('\\b' + eng + '\\b', 'gi');
    modelText = modelText.replace(regex, '');
  });
  
  // O'zbekcha ranglarni o'chirish
  COLORS.forEach(uz => {
    const cleanUz = uz.replace("'", "");
    const regex = new RegExp('\\b' + cleanUz + '\\b', 'gi');
    modelText = modelText.replace(regex, '');
  });
  
  modelText = modelText
    .replace(/[,;:=()\-+]/g, ' ')
    .replace(/\b(?:yangi|ishlatilgan|new|used|uzimei|narx|narxi|price|usd|usd|so'm|som|uzs|sum|imei|imei2|color|rang|rangi)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let model = modelText || 'Model';

  return {
    brand: brand || 'Samsung',
    model,
    imei,
    imei2,
    condition,
    color,
    storageSize,
    ram,
    hasBox: true,
    purchasePrice,
    purchaseDate,
    uzimei,
    status: 'Sotuvda',
    isArchived: false,
    isDeleted: false,
  };
};

// Matnli ro'yxatni (blok matnni) to'liq parse qilish
export const parseTextContent = (text) => {
  const lines = text.split('\n');
  const phones = [];
  
  for (const line of lines) {
    const parsed = parseTextLine(line);
    // Kamida model kiritilgan bo'lishi kerak
    if (parsed && parsed.model && parsed.model.length > 2 && parsed.model !== 'Model') {
      phones.push(parsed);
    }
  }
  
  return phones;
};
