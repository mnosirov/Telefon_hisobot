// Currency formatting utilities
export const formatUZS = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('uz-UZ', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + " so'm";
};

export const formatUSD = (amount) => {
  if (!amount && amount !== 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatCurrency = (amount, currency = 'UZS') => {
  if (currency === 'USD') return formatUSD(amount);
  return formatUZS(amount);
};

export const convertUSDtoUZS = (usd, rate = 12700) => {
  return usd * rate;
};

export const convertUZStoUSD = (uzs, rate = 12700) => {
  return uzs / rate;
};

// Date utilities
export const getTashkentDateString = (date = new Date()) => {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
};

export const formatDate = (date) => {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Tashkent',
  }).format(d);
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const hasTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0);
  
  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Tashkent',
  }).format(d);
};

export const formatTime = (date) => {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const hasTime = !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0);
  if (!hasTime) return '—';
  
  return new Intl.DateTimeFormat('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(d);
};

export const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  const d = dueDate?.toDate ? dueDate.toDate() : new Date(dueDate);
  return d < new Date();
};

// IMEI validation
export const validateIMEI = (imei) => {
  if (!imei) return false;
  
  // Strip out any non-digit characters (spaces, dashes, etc.)
  const cleaned = String(imei).replace(/\D/g, '');
  
  // IMEI 14 xonadan 15 xonagacha raqamlardan iborat bo'lishi kerak
  if (cleaned.length < 14 || cleaned.length > 15) return false;
  
  return true;
};

// Status helpers
export const getStatusBadge = (status) => {
  const map = {
    'Sotuvda': 'badge-green',
    'Sotilgan': 'badge-blue',
    'Qarzda': 'badge-yellow',
    'Qaytarilgan': 'badge-gray',
    'Yetkazib beruvchiga qaytarilgan': 'badge-red',
  };
  return map[status] || 'badge-gray';
};

export const getStatusLabel = (status) => {
  const map = {
    'Sotuvda': 'Sotuvda',
    'Sotilgan': 'Sotilgan',
    'Qarzda': 'Qarzda',
    'Qaytarilgan': 'Qaytarilgan',
    'Yetkazib beruvchiga qaytarilgan': 'Yetkazib beruvchiga qaytarilgan',
  };
  return map[status] || status;
};

export const getDebtStatusBadge = (status) => {
  const map = {
    "To'liq to'langan": 'badge-green',
    "Qisman to'langan": 'badge-yellow',
    "To'lanmagan": 'badge-red',
  };
  return map[status] || 'badge-gray';
};

export const getConditionBadge = (condition) => {
  return condition === 'Yangi' ? 'badge-green' : 'badge-yellow';
};

// Truncate text
export const truncate = (str, n = 30) => {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '...' : str;
};

// Generate unique ID
export const generateId = () => {
  return Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Phone number formatter
export const formatPhone = (phone) => {
  if (!phone) return '—';
  return phone;
};
