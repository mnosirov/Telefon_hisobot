import { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, getDocs, query, where,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { ACTION_TYPES } from '../utils/constants';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setCurrentUser(user);
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            let profile = userDoc.data();

            // Agar shopId yo'q bo'lsa, shops kolleksiyasidan email bo'yicha topamiz
            if (!profile.shopId && user.email) {
              try {
                const shopsSnap = await getDocs(
                  query(collection(db, 'shops'), where('ownerEmail', '==', user.email))
                );
                if (!shopsSnap.empty) {
                  const shopId = shopsSnap.docs[0].id;
                  // Foydalanuvchi hujjatiga shopId ni avtomatik yozamiz
                  await updateDoc(doc(db, 'users', user.uid), { shopId });
                  profile = { ...profile, shopId };
                }
              } catch (e) {
                console.warn('shopId auto-lookup failed:', e);
              }
            }

            setUserProfile(profile);

            // Fetch permissions
            if (profile.role) {
              const permDoc = await getDoc(doc(db, 'rolePermissions', profile.role));
              if (permDoc.exists()) {
                setPermissions(permDoc.data());
              } else {
                // Standart ruxsatlar (bazada yo'q bo'lsa ishlatiladi)
                const defaults = {
                  cashier: { view_inventory: true, create_sales: true },
                  manager: { view_inventory: true, add_phone: true, edit_phone: true, delete_phone: true, create_sales: true, manage_credits: true, view_expenses: true, add_expenses: true, export_reports: true },
                  admin: { view_inventory: true, add_phone: true, edit_phone: true, delete_phone: true, create_sales: true, manage_credits: true, view_expenses: true, add_expenses: true, export_reports: true, manage_users: true, access_settings: true },
                  superadmin: { view_inventory: true, add_phone: true, edit_phone: true, delete_phone: true, create_sales: true, manage_credits: true, view_expenses: true, add_expenses: true, export_reports: true, manage_users: true, access_settings: true }
                };
                setPermissions(defaults[profile.role] || {});
              }
            }
          } else {
            setUserProfile(null);
            setPermissions(null);
          }
        } else {
          setUserProfile(null);
          setPermissions(null);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setCurrentUser(null);
        setUserProfile(null);
        setPermissions(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    // Log login action
    await logAction(result.user.uid, ACTION_TYPES.USER_LOGIN, { email });
    return result;
  };

  const logout = () => signOut(auth);

  const logAction = async (userId, actionType, details = {}) => {
    try {
      const logRef = doc(db, 'activityLogs', `${Date.now()}_${userId}`);
      await setDoc(logRef, {
        userId,
        actionType,
        details,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Log error:', err);
    }
  };

  const hasPermission = (perm) => {
    if (userProfile?.role === 'superadmin') return true;
    return !!permissions?.[perm];
  };

  const canDelete = () => hasPermission('delete_phone');
  const canEdit = () => hasPermission('edit_phone');
  const isAdmin = () => userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
  const hasRole = (role) => {
    if (userProfile?.role === 'superadmin') return true;
    if (role === 'admin') return userProfile?.role === 'admin';
    if (role === 'manager') return userProfile?.role === 'admin' || userProfile?.role === 'manager';
    if (role === 'cashier') return true;
    return userProfile?.role === role;
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    login,
    logout,
    logAction,
    hasPermission,
    canDelete,
    canEdit,
    isAdmin,
    hasRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
