import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Eye, Pencil } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface SupplierRow {
  _id: string;
  supplierName: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'Active' | 'Inactive';
  totalPurchaseValue: number;
  totalOrders: number;
  productCount: number;
}

interface SupplierDetail {
  supplier: SupplierRow;
  totalPurchaseValue: number;
  productsSupplied: Array<{ name: string; sku: string; totalQty: number; totalValue: number }>;
  purchaseHistory: Array<{
    _id: string;
    transactionNumber: string;
    transactionDate: string;
    quantity: number;
    unitCost: number;
    totalAmount: number;
    productId?: { name: string; sku: string; unit: string };
    warehouseId?: { name: string };
  }>;
}

export function SuppliersPage() {
  const { t, brand, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    supplierName: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const canManage = hasPermission('SUPPLIER_MANAGE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await apiRequest<{ suppliers: SupplierRow[] }>(`/api/suppliers${q}`);
      setSuppliers(res.suppliers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      supplierName: '',
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
      status: 'Active',
    });
    setFormOpen(true);
  };

  const openEdit = (s: SupplierRow) => {
    setEditing(s);
    setForm({
      supplierName: s.supplierName,
      companyName: s.companyName,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || '',
      status: s.status,
    });
    setFormOpen(true);
  };

  const openDetail = async (s: SupplierRow) => {
    try {
      const res = await apiRequest<SupplierDetail>(`/api/suppliers/${s._id}`);
      setDetail(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load supplier profile');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/suppliers/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        showSuccess('Supplier updated.');
      } else {
        await apiRequest('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        showSuccess('Supplier added.');
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : suppliers.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Supplier Name</th>
                  <th className="text-left font-semibold px-4 py-3">Company</th>
                  <th className="text-left font-semibold px-4 py-3">Contact Person</th>
                  <th className="text-left font-semibold px-4 py-3">Phone</th>
                  <th className="text-right font-semibold px-4 py-3">Orders</th>
                  <th className="text-right font-semibold px-4 py-3">Total Purchase Value</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.supplierName}</td>
                    <td className="px-4 py-3 text-slate-700">{s.companyName}</td>
                    <td className="px-4 py-3 text-slate-600">{s.contactPerson}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{s.phone}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.totalOrders}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[#0B192C]">
                      {formatCurrency(s.totalPurchaseValue, brand.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDetail(s)}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Supplier' : 'Add Supplier'}
        maxWidth="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Name</label>
              <input
                type="text"
                required
                value={form.supplierName}
                onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                required
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
              <input
                type="text"
                required
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.notes}</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md"
            >
              {saving ? '...' : t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? detail.supplier.supplierName : ''}
        subtitle={detail ? `${detail.supplier.companyName} · ${detail.supplier.phone}` : ''}
        maxWidth="4xl"
      >
        {detail && (
          <div className="space-y-5 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
              <span>Total Purchase Value from Supplier</span>
              <strong className="text-base font-mono text-[#0B192C]">
                {formatCurrency(detail.totalPurchaseValue, brand.currency)}
              </strong>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Products Supplied</h4>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-right p-2">Total Qty</th>
                      <th className="text-right p-2">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.productsSupplied.map((p) => (
                      <tr key={p.sku}>
                        <td className="p-2 font-mono">{p.sku}</td>
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2 text-right font-mono">{p.totalQty}</td>
                        <td className="p-2 text-right font-mono font-semibold">
                          {formatCurrency(p.totalValue, brand.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Purchase History</h4>
              <div className="border border-slate-200 rounded-md overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Tx #</th>
                      <th className="text-left p-2">Warehouse</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.purchaseHistory.map((h) => (
                      <tr key={h._id}>
                        <td className="p-2 font-mono">{formatDate(h.transactionDate, brand.dateFormat)}</td>
                        <td className="p-2 font-mono">{h.transactionNumber}</td>
                        <td className="p-2">{h.warehouseId?.name}</td>
                        <td className="p-2">{h.productId?.name}</td>
                        <td className="p-2 text-right font-mono">{h.quantity}</td>
                        <td className="p-2 text-right font-mono font-semibold">
                          {formatCurrency(h.totalAmount, brand.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
