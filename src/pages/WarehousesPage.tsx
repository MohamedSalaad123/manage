import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Eye, Pencil, Power, Trash2 } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface WarehouseRow {
  _id: string;
  name: string;
  code: string;
  location: string;
  address: string;
  phone: string;
  description: string;
  status: 'Active' | 'Inactive';
  managerId?: { _id: string; fullName: string; email: string } | null;
  totalQuantity: number;
  totalValue: number;
  productCount: number;
  employeeCount: number;
  createdAt: string;
}

interface UserOption {
  _id: string;
  fullName: string;
  role: string;
}

interface WarehouseDetail {
  warehouse: WarehouseRow;
  summary: {
    totalStockValue: number;
    totalStockQty: number;
    skuCount: number;
    employeeCount: number;
  };
  inventory: Array<{
    _id: string;
    availableQty: number;
    reservedQty: number;
    averageCost: number;
    totalValue: number;
    productId?: { name: string; sku: string; unit: string };
  }>;
  employees: Array<{ _id: string; fullName: string; employeeCode: string; position: string; phone: string }>;
  transactions: Array<{
    _id: string;
    transactionNumber: string;
    movementType: string;
    quantityIn: number;
    quantityOut: number;
    transactionDate: string;
    productId?: { name: string; sku: string };
  }>;
}

export function WarehousesPage() {
  const { t, language, brand, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'inventory' | 'employees' | 'transactions'>('inventory');
  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    location: '',
    address: '',
    managerId: '',
    phone: '',
    description: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const canManage = hasPermission('WAREHOUSE_MANAGE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const [whRes, usrRes] = await Promise.all([
        apiRequest<{ warehouses: WarehouseRow[] }>(`/api/warehouses?${params.toString()}`),
        apiRequest<{ users: UserOption[] }>('/api/users'),
      ]);
      setWarehouses(whRes.warehouses);
      setUsers(usrRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load warehouses');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      code: '',
      location: '',
      address: '',
      managerId: '',
      phone: '',
      description: '',
      status: 'Active',
    });
    setFormOpen(true);
  };

  const openEdit = (wh: WarehouseRow) => {
    setEditing(wh);
    setForm({
      name: wh.name,
      code: wh.code,
      location: wh.location,
      address: wh.address,
      managerId: wh.managerId?._id || '',
      phone: wh.phone,
      description: wh.description || '',
      status: wh.status,
    });
    setFormOpen(true);
  };

  const openDetail = async (wh: WarehouseRow) => {
    try {
      const res = await apiRequest<WarehouseDetail>(`/api/warehouses/${wh._id}`);
      setDetail(res);
      setDetailTab('inventory');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load warehouse details');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, managerId: form.managerId || null };
      if (editing) {
        await apiRequest(`/api/warehouses/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showSuccess(language === 'so' ? 'Bakhaarka waa la cusbooneysiiyay.' : 'Warehouse updated.');
      } else {
        await apiRequest('/api/warehouses', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showSuccess(language === 'so' ? 'Bakhaar cusub waa la abuuray.' : 'Warehouse created.');
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save warehouse');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (wh: WarehouseRow) => {
    const next = wh.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await apiRequest(`/api/warehouses/${wh._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      showSuccess(
        language === 'so'
          ? `Xaaladda bakhaarka waxaa laga dhigay ${next}.`
          : `Warehouse status changed to ${next}.`
      );
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/warehouses/${deleteTarget._id}`, { method: 'DELETE' });
      showSuccess(language === 'so' ? 'Bakhaarka waa la tirtiray.' : 'Warehouse deleted.');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Cannot delete warehouse');
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-64">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.common.search}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allStatuses}</option>
            <option value="Active">{t.common.active}</option>
            <option value="Inactive">{t.common.inactive}</option>
          </select>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'so' ? 'Abuur Bakhaar' : 'New Warehouse'}</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : warehouses.length === 0 ? (
          <EmptyState
            title={t.common.noData}
            actionLabel={canManage ? (language === 'so' ? 'Abuur Bakhaar' : 'Create Warehouse') : undefined}
            onAction={canManage ? openCreate : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Code</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.warehouse}</th>
                  <th className="text-left font-semibold px-4 py-3">Location</th>
                  <th className="text-left font-semibold px-4 py-3">Manager</th>
                  <th className="text-right font-semibold px-4 py-3">Stock Qty</th>
                  <th className="text-right font-semibold px-4 py-3">Stock Value</th>
                  <th className="text-right font-semibold px-4 py-3">Staff</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouses.map((wh) => (
                  <tr key={wh._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582] whitespace-nowrap">
                      {wh.code}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{wh.name}</td>
                    <td className="px-4 py-3 text-slate-600">{wh.location}</td>
                    <td className="px-4 py-3 text-slate-700">{wh.managerId?.fullName || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(wh.totalQuantity)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(wh.totalValue, brand.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{wh.employeeCount}</td>
                    <td className="px-4 py-3">
                      <StatusLabel status={wh.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDetail(wh)}
                          title={t.common.view}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(wh)}
                              title={t.common.edit}
                              className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStatus(wh)}
                              title={wh.status === 'Active' ? 'Deactivate' : 'Activate'}
                              className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(wh)}
                              title={t.common.delete}
                              className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          editing
            ? language === 'so'
              ? 'Wax Ka Beddel Bakhaarka'
              : 'Edit Warehouse'
            : language === 'so'
            ? 'Abuur Bakhaar Cusub'
            : 'Create New Warehouse'
        }
        maxWidth="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse Code</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="WH-KIS-01"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City / Location</label>
              <input
                type="text"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Address</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse Manager</label>
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">-- Select Manager --</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.fullName} ({u.role.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.status}</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
            >
              {saving ? '...' : t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Warehouse Detail Modal */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.warehouse.name} (${detail.warehouse.code})` : ''}
        subtitle={detail ? `${detail.warehouse.location} · ${detail.warehouse.address} · ${detail.warehouse.phone}` : ''}
        maxWidth="4xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Stock Value</p>
                <p className="text-base font-bold font-mono tabular-nums text-[#0B192C] mt-1">
                  {formatCurrency(detail.summary.totalStockValue, brand.currency)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Total Units</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatNumber(detail.summary.totalStockQty)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Active SKUs</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {detail.summary.skuCount}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Assigned Staff</p>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {detail.summary.employeeCount}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
              {(['inventory', 'employees', 'transactions'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                    detailTab === tab ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {tab === 'inventory'
                    ? 'Warehouse Inventory'
                    : tab === 'employees'
                    ? 'Warehouse Employees'
                    : 'Transactions'}
                </button>
              ))}
            </div>

            {detailTab === 'inventory' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">SKU</th>
                      <th className="text-left px-3 py-2">{t.common.product}</th>
                      <th className="text-right px-3 py-2">Available</th>
                      <th className="text-right px-3 py-2">Reserved</th>
                      <th className="text-right px-3 py-2">Avg Cost</th>
                      <th className="text-right px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.inventory.map((item) => (
                      <tr key={item._id}>
                        <td className="px-3 py-2 font-mono">{item.productId?.sku}</td>
                        <td className="px-3 py-2 font-medium">{item.productId?.name}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatNumber(item.availableQty)} {item.productId?.unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatNumber(item.reservedQty)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(item.averageCost, brand.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(item.totalValue, brand.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'employees' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">ID</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Position</th>
                      <th className="text-left px-3 py-2">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.employees.map((e) => (
                      <tr key={e._id}>
                        <td className="px-3 py-2 font-mono">{e.employeeCode}</td>
                        <td className="px-3 py-2 font-medium">{e.fullName}</td>
                        <td className="px-3 py-2">{e.position}</td>
                        <td className="px-3 py-2 font-mono">{e.phone}</td>
                      </tr>
                    ))}
                    {detail.employees.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          {t.common.noData}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'transactions' && (
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">{t.common.date}</th>
                      <th className="text-left px-3 py-2">Tx #</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">{t.common.product}</th>
                      <th className="text-right px-3 py-2">In</th>
                      <th className="text-right px-3 py-2">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.transactions.map((tx) => (
                      <tr key={tx._id}>
                        <td className="px-3 py-2 font-mono">{formatDate(tx.transactionDate, brand.dateFormat)}</td>
                        <td className="px-3 py-2 font-mono">{tx.transactionNumber}</td>
                        <td className="px-3 py-2">{tx.movementType}</td>
                        <td className="px-3 py-2">{tx.productId?.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">
                          {tx.quantityIn || '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-red-700">
                          {tx.quantityOut || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={language === 'so' ? 'Tirtir Bakhaarka' : 'Delete Warehouse'}
        message={
          deleteTarget
            ? `Are you sure you want to delete ${deleteTarget.name} (${deleteTarget.code})? Warehouses with stock or transaction history cannot be deleted.`
            : ''
        }
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
