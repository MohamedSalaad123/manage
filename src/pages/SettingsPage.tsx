import React, { useState, useEffect, useCallback } from 'react';
import { Save, Upload, Database } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api';
import { formatDate } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface SettingsDoc {
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  currency: string;
  defaultLanguage: 'so' | 'en';
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  notificationSettings: {
    lowStockAlerts: boolean;
    outOfStockAlerts: boolean;
    transferAlerts: boolean;
    stockInOutAlerts: boolean;
  };
  approvalSettings: {
    requireTransferApproval: boolean;
    requireAdjustmentApproval: boolean;
    requireStockCountApproval: boolean;
    allowNegativeStock: boolean;
  };
  rolePermissions: Record<string, string[]>;
  backupConfig: {
    autoBackupEnabled: boolean;
    frequency: 'daily' | 'weekly' | 'manual';
    lastBackupAt?: string | null;
  };
}

interface AuditRow {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityRef: string;
  createdAt: string;
}

const ALL_PERM_KEYS = [
  'WAREHOUSE_VIEW_ALL',
  'WAREHOUSE_MANAGE',
  'PRODUCT_VIEW',
  'PRODUCT_MANAGE',
  'INVENTORY_VIEW',
  'STOCK_IN_CREATE',
  'STOCK_IN_CONFIRM',
  'STOCK_OUT_CREATE',
  'STOCK_OUT_CONFIRM',
  'TRANSFER_CREATE',
  'TRANSFER_APPROVE',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE',
  'ADJUSTMENT_CREATE',
  'ADJUSTMENT_APPROVE',
  'STOCK_COUNT_CREATE',
  'STOCK_COUNT_APPROVE',
  'SUPPLIER_MANAGE',
  'EMPLOYEE_MANAGE',
  'REPORTS_VIEW',
  'REPORTS_EXPORT',
  'SETTINGS_MANAGE',
  'AUDIT_VIEW',
];

export function SettingsPage() {
  const { refreshBrand, setLanguage } = useAuth();
  const { showSuccess, showError } = useToast();

  const [tab, setTab] = useState<'general' | 'permissions' | 'audit'>('general');
  const [settings, setSettings] = useState<SettingsDoc | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, aRes] = await Promise.all([
        apiRequest<{ settings: SettingsDoc }>('/api/settings'),
        apiRequest<{ logs: AuditRow[] }>('/api/audit-logs').catch(() => ({ logs: [] })),
      ]);
      setSettings(sRes.settings);
      setAuditLogs(aRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await apiRequest('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      await setLanguage(settings.defaultLanguage);
      await refreshBrand();
      showSuccess('System settings saved.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    try {
      const url = await uploadFile(file);
      setSettings({ ...settings, companyLogo: url });
      showSuccess('Logo uploaded. Save settings to apply.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const toggleRolePermission = (role: string, perm: string) => {
    if (!settings || role === 'SUPER_ADMIN') return;
    const current = settings.rolePermissions[role] || [];
    const next = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    setSettings({
      ...settings,
      rolePermissions: {
        ...settings.rolePermissions,
        [role]: next,
      },
    });
  };

  const triggerBackup = async () => {
    try {
      const res = await apiRequest<{ settings: SettingsDoc }>('/api/settings/backup-now', {
        method: 'POST',
      });
      setSettings(res.settings);
      showSuccess('Database snapshot checkpoint recorded.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Backup failed');
    }
  };

  if (loading || !settings) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg">
        {error ? <ErrorBanner message={error} onRetry={loadData} /> : <TableSkeleton rows={6} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${
            tab === 'general' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
          }`}
        >
          Company & Operations Settings
        </button>
        <button
          type="button"
          onClick={() => setTab('permissions')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${
            tab === 'permissions' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
          }`}
        >
          Role Permissions Matrix
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-3 py-1.5 text-xs font-semibold rounded ${
            tab === 'audit' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
          }`}
        >
          System Audit Logs ({auditLogs.length})
        </button>
      </div>

      {tab === 'general' && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                required
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Phone</label>
              <input
                type="text"
                value={settings.companyPhone}
                onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Address</label>
              <input
                type="text"
                value={settings.companyAddress}
                onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Logo</label>
              <div className="flex items-center gap-3">
                <img
                  src={settings.companyLogo}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded border border-slate-200 object-cover"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Logo</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Currency</label>
              <input
                type="text"
                value={settings.currency}
                onChange={(e) => setSettings({ ...settings, currency: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Primary Language</label>
              <select
                value={settings.defaultLanguage}
                onChange={(e) =>
                  setSettings({ ...settings, defaultLanguage: e.target.value as 'so' | 'en' })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="so">Somali (Primary)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date Format</label>
              <select
                value={settings.dateFormat}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dateFormat: e.target.value as 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY',
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Backup Schedule</label>
              <div className="flex items-center gap-2">
                <select
                  value={settings.backupConfig.frequency}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      backupConfig: {
                        ...settings.backupConfig,
                        frequency: e.target.value as 'daily' | 'weekly' | 'manual',
                      },
                    })
                  }
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="daily">Daily Automatic</option>
                  <option value="weekly">Weekly Automatic</option>
                  <option value="manual">Manual Only</option>
                </select>
                <button
                  type="button"
                  onClick={triggerBackup}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Backup Now</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-xs">
            <div className="space-y-2.5">
              <p className="font-semibold text-[#0B192C]">Notification Triggers</p>
              {(
                [
                  ['lowStockAlerts', 'Low Stock Alerts'],
                  ['outOfStockAlerts', 'Out of Stock Alerts'],
                  ['transferAlerts', 'Warehouse Transfer Notifications'],
                  ['stockInOutAlerts', 'Stock In & Stock Out Alerts'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.notificationSettings[key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notificationSettings: {
                          ...settings.notificationSettings,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2.5">
              <p className="font-semibold text-[#0B192C]">Stock & Approval Controls</p>
              {(
                [
                  ['requireTransferApproval', 'Require Manager Approval for Transfers'],
                  ['requireAdjustmentApproval', 'Require Approval for Stock Adjustments'],
                  ['requireStockCountApproval', 'Require Approval for Physical Stock Counts'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.approvalSettings[key]}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        approvalSettings: {
                          ...settings.approvalSettings,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {tab === 'permissions' && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">
              Configure operational permissions per role. Super Admin retains full system access.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md"
            >
              Save Permissions
            </button>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-2.5">Permission</th>
                  {['GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT'].map((r) => (
                    <th key={r} className="text-center p-2.5 font-semibold">
                      {r.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_PERM_KEYS.map((perm) => (
                  <tr key={perm}>
                    <td className="p-2.5 font-mono text-[11px]">{perm}</td>
                    {['GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT'].map((role) => (
                      <td key={role} className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={(settings.rolePermissions[role] || []).includes(perm)}
                          onChange={() => toggleRolePermission(role, perm)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-2.5">Timestamp</th>
                  <th className="text-left px-4 py-2.5">User</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                  <th className="text-left px-4 py-2.5">Action</th>
                  <th className="text-left px-4 py-2.5">Entity</th>
                  <th className="text-left px-4 py-2.5">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((l) => (
                  <tr key={l._id}>
                    <td className="px-4 py-2.5 font-mono text-slate-600">
                      {formatDate(l.createdAt, settings.dateFormat)}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{l.actorName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.actorRole}</td>
                    <td className="px-4 py-2.5 font-mono text-[#245582]">{l.action}</td>
                    <td className="px-4 py-2.5">{l.entityType}</td>
                    <td className="px-4 py-2.5 font-mono">{l.entityRef || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
