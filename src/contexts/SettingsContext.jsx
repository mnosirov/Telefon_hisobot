import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

export const SettingsProvider = ({ children }) => {
  const { userProfile, currentUser } = useAuth();
  const [globalSettings, setGlobalSettings] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Global Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemSettings', 'global'), (snap) => {
      if (snap.exists()) {
        setGlobalSettings(snap.data());
      }
    }, (err) => {
      console.warn("Failed to subscribe to global settings:", err);
    });
    return () => unsub();
  }, []);

  // 2. Fetch Shop-specific data
  useEffect(() => {
    if (!userProfile?.shopId) {
      setShopData(null);
      if (userProfile) setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'shops', userProfile.shopId), (snap) => {
      if (snap.exists()) {
        setShopData({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    }, (err) => {
      console.warn("Failed to subscribe to shop data:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [userProfile?.shopId]);

  const isMaintenance = globalSettings?.maintenanceMode && userProfile?.role !== 'superadmin';
  
  const checkSubscription = useCallback(() => {
    if (!shopData) return { active: true, message: '' };
    
    if (shopData.status !== 'active') {
      return { active: false, message: 'Do\'kon holati faol emas. Iltimos, administrator bilan bog\'laning.' };
    }

    const expiryDate = new Date(shopData.planExpiry);
    const now = new Date();
    
    if (expiryDate < now) {
      return { active: false, message: 'Obuna muddati tugagan. Iltimos, obunani yangilang.' };
    }

    return { active: true, message: '' };
  }, [shopData]);

  const updateExchangeRate = async (newRate) => {
    if (!userProfile?.shopId) return;
    try {
      await updateDoc(doc(db, 'shops', userProfile.shopId), {
        exchangeRate: Number(newRate)
      });
    } catch (err) {
      console.error('Error updating rate:', err);
      throw err;
    }
  };

  const updateShopSettings = async (settingsData) => {
    if (!userProfile?.shopId) return;
    try {
      await updateDoc(doc(db, 'shops', userProfile.shopId), settingsData);
    } catch (err) {
      console.error('Error updating shop settings:', err);
      throw err;
    }
  };

  const value = {
    globalSettings,
    brands: globalSettings?.brands || ['Samsung', 'Apple', 'Huawei', 'Honor', 'Xiaomi', 'Oppo', 'Vivo', 'Realme', 'Nokia'],
    expenseCategories: globalSettings?.expenseCategories || ['Ijara', 'Maosh', 'Transport', 'Reklama', 'Boshqa'],
    colors: globalSettings?.colors || [
      'Qora', 'Oq', 'Kulrang', 'Kumush', 'Oltin', 'Ko\'k', 'Qizil',
      'Yashil', 'Sariq', 'To\'q sariq', 'Binafsha', 'Pushti', 'Jigarrang',
    ],
    currency: shopData?.currency || globalSettings?.currency || 'USD',
    exchangeRate: shopData?.exchangeRate || globalSettings?.exchangeRate || 12700,
    appSettings: {
      name: globalSettings?.appName || 'PhoneReport',
      logo: globalSettings?.logoUrl || null,
    },
    shopData,
    isMaintenance,
    subscription: checkSubscription(),
    updateExchangeRate,
    updateShopSettings,
    loading: loading && !!currentUser,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
