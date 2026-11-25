import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Search,
  Bell,
  LogOut,
  KeyRound,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../lib/api';
import { Modal } from '../ui/Modal';
import type { NavSection } from './Sidebar';

interface SearchResults {
  warehouses: Array<{ _id: string; name: string; code: string; location: string }>;
  products: Array<{ _id: string; name: string; sku: string; unit: string }>;
  transactions: Array<{ _id: string; transactionNumber: string; movementType: string }>;
  transfers: Array<{ _id: string; transferNumber: string; status: string }>;
  suppliers: Array<{ _id: string; supplierName: string; companyName: string }>;
}

interface TopBarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onOpenMobileNav: () => void;
}

export function TopBar({ activeSection, onNavigate, onOpenMobileNav }: TopBarProps) {
  const { user, brand, language, setLanguage, t, unreadNotifications, logout } = useAuth();
  const { showSuccess, showError } = useToast();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<SearchResults>(`/api/search?q=${encodeURIComponent(trimmed)}`);
        setResults(res);
        setSearchOpen(true);
      } catch {
        setResults(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPwd(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      showSuccess(
        language === 'so'
          ? 'Furaha sirta ah si guul leh ayaa loo beddelay.'
          : 'Password updated successfully.'
      );
      setPwdModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSavingPwd(false);
    }
  };

  const sectionLabel = t.nav[activeSection];

  return (
    <header className="no-print sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 truncate">{brand.companyName}</p>
          <h1 className="text-sm lg:text-base font-bold text-[#0B192C] truncate">{sectionLabel}</h1>
        </div>
      </div>

      <div ref={searchRef} className="relative flex-1 max-w-md hidden md:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results && setSearchOpen(true)}
            placeholder={t.common.globalSearchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#245582] focus:bg-white"
          />
        </div>

        {searchOpen && results && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-md shadow-lg max-h-80 overflow-y-auto z-50 divide-y divide-slate-100 text-xs">
            {results.warehouses.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">{t.nav.warehouses}</p>
                {results.warehouses.map((w) => (
                  <button
                    key={w._id}
                    type="button"
                    onClick={() => {
                      onNavigate('warehouses');
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{w.name}</span>
                    <span className="font-mono text-slate-500">{w.code}</span>
                  </button>
                ))}
              </div>
            )}
            {results.products.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">{t.nav.products}</p>
                {results.products.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => {
                      onNavigate('products');
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="font-mono text-slate-500">{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {results.transfers.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">{t.nav.transfers}</p>
                {results.transfers.map((tr) => (
                  <button
                    key={tr._id}
                    type="button"
                    onClick={() => {
                      onNavigate('transfers');
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center justify-between"
                  >
                    <span className="font-mono font-medium text-slate-800">{tr.transferNumber}</span>
                    <span className="text-slate-500">{tr.status}</span>
                  </button>
                ))}
              </div>
            )}
            {results.transactions.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">Ledger / Stock</p>
                {results.transactions.map((tx) => (
                  <button
                    key={tx._id}
                    type="button"
                    onClick={() => {
                      onNavigate('reports');
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center justify-between"
                  >
                    <span className="font-mono font-medium text-slate-800">{tx.transactionNumber}</span>
                    <span className="text-slate-500">{tx.movementType}</span>
                  </button>
                ))}
              </div>
            )}
            {results.suppliers.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold text-slate-500">{t.nav.suppliers}</p>
                {results.suppliers.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => {
                      onNavigate('suppliers');
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{s.supplierName}</span>
                    <span className="text-slate-500">{s.companyName}</span>
                  </button>
                ))}
              </div>
            )}
            {results.warehouses.length === 0 &&
              results.products.length === 0 &&
              results.transactions.length === 0 &&
              results.transfers.length === 0 &&
              results.suppliers.length === 0 && (
                <p className="p-3 text-center text-slate-500">{t.common.noData}</p>
              )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
          <button
            type="button"
            onClick={() => setLanguage('so')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              language === 'so'
                ? 'bg-[#0B192C] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SO
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              language === 'en'
                ? 'bg-[#0B192C] text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
          aria-label={t.nav.notifications}
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center bg-red-600 text-white text-[10px] font-mono font-bold rounded">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 text-xs"
          >
            <span className="w-6 h-6 rounded bg-[#245582] text-white font-semibold flex items-center justify-center shrink-0">
              {user?.fullName?.slice(0, 1).toUpperCase() || 'U'}
            </span>
            <span className="hidden sm:inline font-medium text-slate-800 max-w-28 truncate">
              {user?.fullName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1.5 z-50 text-xs">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-semibold text-slate-900 truncate">{user?.fullName}</p>
                <p className="text-slate-500 truncate">{user?.email}</p>
                <p className="text-[11px] font-mono text-[#245582] mt-0.5">
                  {user?.role.replace(/_/g, ' ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  setPwdModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t.common.changePassword}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-700 hover:bg-red-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.common.signOut}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        title={t.common.changePassword}
        maxWidth="md"
      >
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {language === 'so' ? 'Furaha Sirta Hadda' : 'Current Password'}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {language === 'so' ? 'Furaha Sirta Cusub (ugu yaraan 8 xaraf)' : 'New Password (min 8 chars)'}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPwdModalOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={savingPwd}
              className="px-4 py-2 text-xs font-medium bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
            >
              {savingPwd ? '...' : t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
}
