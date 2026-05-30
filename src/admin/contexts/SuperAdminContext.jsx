import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';

const SuperAdminContext = createContext(null);

export const useSuperAdmin = () => {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error('useSuperAdmin must be used within SuperAdminProvider');
  return ctx;
};

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const SuperAdminProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [superAdminProfile, setSuperAdminProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      signOut(auth);
    }, TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => events.forEach((e) => window.removeEventListener(e, resetTimer));
  }, [resetTimer]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().role === 'superadmin') {
            setCurrentUser(user);
            setSuperAdminProfile(userDoc.data());
            resetTimer();
          } else {
            setCurrentUser(null);
            setSuperAdminProfile(null);
          }
        } else {
          setCurrentUser(null);
          setSuperAdminProfile(null);
        }
      } catch (err) {
        console.error('SuperAdmin Auth check error:', err);
        setCurrentUser(null);
        setSuperAdminProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [resetTimer]);

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, 'users', result.user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'superadmin') {
      await signOut(auth);
      throw new Error('Ruxsat yo\'q. Faqat Superadmin kirishi mumkin.');
    }
    // Log login
    await auditLog(result.user.uid, email, 'superadmin_login', { email });
    return result;
  };

  const logout = () => signOut(auth);

  const auditLog = async (userId, userName, actionType, details = {}) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        userId: userId || 'system',
        userName: userName || 'System',
        actionType,
        details,
        timestamp: serverTimestamp(),
        ip: 'N/A', // Client-side IP fetching requires external API
      });
    } catch (err) {
      console.error('Audit log error:', err);
    }
  };

  const value = {
    currentUser,
    superAdminProfile,
    loading,
    login,
    logout,
    auditLog,
  };

  return (
    <SuperAdminContext.Provider value={value}>
      {!loading && children}
    </SuperAdminContext.Provider>
  );
};
