import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, setAuthToken } from '../lib/api';
import { translations, type Language } from '../i18n/translations';

export interface AuthUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: 'SUPER_ADMIN' | 'GENERAL_MANAGER' | 'WAREHOUSE_MANAGER' | 'STOREKEEPER' | 'ACCOUNTANT';
  assignedWarehouseId: string | null;
  assignedWarehouseName: string | null;
  preferredLanguage: Language;
  permissions: string[];
}

export interface CompanyBrand {
  companyName: string;
  companyLogo: string;
  defaultLanguage: Language;
  currency: string;
  dateFormat?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  brand: CompanyBrand;
  language: Language;
  t: (typeof translations)['so'];
  needsBootstrap: boolean | null;
  unreadNotifications: number;
  setLanguage: (lang: Language) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  refreshBrand: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  bootstrap: (payload: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    initializeStarterData: boolean;
  }) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [language, setLanguageState] = useState<Language>('so');
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [brand, setBrand] = useState<CompanyBrand>({
    companyName: 'KHAYRE CONSTRUCTION AND MATERIALS COMPANY',
    companyLogo: '/src/assets/images/khayre_logo_1795416086464.jpg',
    defaultLanguage: 'so',
    currency: 'USD',
    dateFormat: 'YYYY-MM-DD',
  });

  const refreshBrand = useCallback(async () => {
    try {
      const pub = await apiRequest<CompanyBrand>('/api/settings/public');
      setBrand(pub);
      if (!user) {
        setLanguageState(pub.defaultLanguage || 'so');
      }
    } catch {
      // Keep default brand on transient load failure
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ needsBootstrap: boolean }>('/api/auth/bootstrap-status'),
      apiRequest<CompanyBrand>('/api/settings/public'),
    ])
      .then(([boot, pub]) => {
        if (!active) return;
        setNeedsBootstrap(boot.needsBootstrap);
        setBrand(pub);
        setLanguageState(pub.defaultLanguage || 'so');
      })
      .catch(() => {
        if (active) setNeedsBootstrap(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ unreadCount: number }>('/api/notifications');
      setUnreadNotifications(res.unreadCount || 0);
    } catch {
      // Ignore background notification fetch errors
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshUnreadCount();
    const timer = setInterval(refreshUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [user, refreshUnreadCount]);

  const login = async (identifier: string, password: string) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setLanguageState(res.user.preferredLanguage || brand.defaultLanguage || 'so');
    setNeedsBootstrap(false);
  };

  const bootstrap = async (payload: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    initializeStarterData: boolean;
  }) => {
    const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setLanguageState(res.user.preferredLanguage || 'so');
    setNeedsBootstrap(false);
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
    setUnreadNotifications(0);
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    if (user) {
      try {
        await apiRequest('/api/auth/language', {
          method: 'PATCH',
          body: JSON.stringify({ language: lang }),
        });
      } catch {
        // Non-blocking UI preference update
      }
    }
  };

  const hasPermission = useCallback(
    (perm: string) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return user.permissions.includes(perm);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        brand,
        language,
        t: translations[language] as (typeof translations)['so'],
        needsBootstrap,
        unreadNotifications,
        setLanguage,
        refreshUnreadCount,
        refreshBrand,
        login,
        bootstrap,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
