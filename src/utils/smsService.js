import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const BASE_URL = '/api/eskiz';

/**
 * Clean phone number to match Uzbek number format: 998901234567
 */
export const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  // If it starts with 998 and is 12 digits, it's correct
  // If it is 9 digits (e.g., 901234567), prepend 998
  if (digits.length === 9) {
    digits = '998' + digits;
  }
  return digits.length === 12 && digits.startsWith('998') ? digits : '';
};

/**
 * Log in to Eskiz.uz and retrieve JWT token
 */
export const loginToEskiz = async (email, password) => {
  try {
    const cleanEmail = (email || '').trim();
    const cleanPassword = (password || '').trim();

    const formData = new FormData();
    formData.append('email', cleanEmail);
    formData.append('password', cleanPassword);

    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.message || 'Eskiz login amalga oshmadi. Login yoki parolni tekshiring.';
      if (msg.toLowerCase().includes('неверный email или пароль') || msg.toLowerCase().includes('неверный email')) {
        msg = "Eskiz.uz shaxsiy kabinetidagi email yoki parol xato kiritilgan. Iltimos, ma'lumotlarni tekshirib qaytadan kiriting.";
      }
      throw new Error(msg);
    }

    const res = await response.json();
    if (res.data && res.data.token) {
      return res.data.token;
    } else if (res.token) {
      return res.token;
    } else {
      throw new Error('Eskiz API javobida token topilmadi.');
    }
  } catch (error) {
    console.error('Eskiz Login Error:', error);
    throw error;
  }
};

/**
 * Send SMS message using Eskiz.uz API
 */
export const sendSmsViaEskiz = async (token, mobilePhone, message, from = '4546') => {
  try {
    const formData = new FormData();
    formData.append('mobile_phone', mobilePhone);
    formData.append('message', message);
    formData.append('from', from);

    const response = await fetch(`${BASE_URL}/message/sms/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.message || 'SMS yuborishda xatolik yuz berdi.';
      if (msg.includes('Для теста можно использовать') || msg.toLowerCase().includes('для теста')) {
        msg = "Eskiz.uz hisobingiz test (sinov) rejimida turibdi. Haqiqiy SMS yuborish uchun Eskiz.uz profilingizda balansni to'ldirishingiz yoki faol tarif sotib olishingiz kerak.";
      }
      throw new Error(msg);
    }

    return await response.json();
  } catch (error) {
    console.error('Eskiz Send SMS Error:', error);
    throw error;
  }
};

/**
 * Get cached token or refresh it if missing or expired, saving back to Firestore
 */
export const getValidEskizToken = async (shopId, shopData) => {
  let email = shopData?.eskizEmail;
  let password = shopData?.eskizPassword;
  let token = shopData?.eskizToken;
  let tokenExpiry = shopData?.eskizTokenExpiry;
  let isGlobal = false;

  if (!email || !password) {
    console.log('Shop SMS credentials not found. Falling back to global settings...');
    const globalDoc = await getDoc(doc(db, 'systemSettings', 'global'));
    if (globalDoc.exists()) {
      const globalData = globalDoc.data();
      if (globalData.smsEnabled && globalData.eskizEmail && globalData.eskizPassword) {
        email = globalData.eskizEmail;
        password = globalData.eskizPassword;
        token = globalData.eskizToken;
        tokenExpiry = globalData.eskizTokenExpiry;
        isGlobal = true;
      }
    }
  }

  if (!email || !password) {
    throw new Error('Eskiz email yoki paroli kiritilmagan (do\'konda ham, tizim sozlamalarida ham).');
  }

  const now = new Date();

  // If token exists and is valid (expiry is in the future)
  if (token && tokenExpiry) {
    const expiryDate = new Date(tokenExpiry);
    // Add 1 hour buffer to avoid border cases
    expiryDate.setHours(expiryDate.getHours() - 1);

    if (expiryDate > now) {
      return token;
    }
  }

  // Token is expired or missing, fetch a new one
  console.log('Eskiz token is expired or missing. Requesting new one...');
  const newToken = await loginToEskiz(email, password);

  // Calculate expiry: 29 days from now (Eskiz tokens last 30 days)
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 29);

  // Update token in appropriate document in Firestore
  if (isGlobal) {
    await updateDoc(doc(db, 'systemSettings', 'global'), {
      eskizToken: newToken,
      eskizTokenExpiry: expiry.toISOString()
    });
  } else if (shopId) {
    await updateDoc(doc(db, 'shops', shopId), {
      eskizToken: newToken,
      eskizTokenExpiry: expiry.toISOString()
    });
  }

  return newToken;
};

/**
 * Send SMS notification for a shop
 */
export const sendShopSms = async (shopId, shopData, phone, message) => {
  if (!shopData?.smsEnabled) {
    console.log('SMS xabarnomalari o\'chirilgan.');
    return { success: false, reason: 'SMS o\'chirilgan' };
  }

  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    console.warn('Noto\'g\'ri telefon raqami kiritilgan:', phone);
    return { success: false, reason: 'Telefon raqam xato' };
  }

  try {
    const token = await getValidEskizToken(shopId, shopData);
    let fromNumber = shopData?.eskizFrom;
    if (!fromNumber) {
      const globalDoc = await getDoc(doc(db, 'systemSettings', 'global'));
      if (globalDoc.exists()) {
        fromNumber = globalDoc.data().eskizFrom;
      }
    }
    if (!fromNumber) fromNumber = '4546';

    const result = await sendSmsViaEskiz(token, cleanedPhone, message, fromNumber);
    console.log('SMS muvaffaqiyatli yuborildi:', result);
    return { success: true, result };
  } catch (error) {
    console.error('Shop SMS send failure:', error);
    return { success: false, error: error.message };
  }
};
