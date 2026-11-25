import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface AdjustmentRow {
  _id: string;
  adjustmentNumber: string;
  warehouseId: { _id: string; name: string; code: string };
  productId: { _id: string; name: string; sku: string; unit: string };
  adjustmentType: string;
  previousQuantity: number;
  adjustmentQuantity: number;
  newQuantity: number;
  reason: string;
  status: string;
  adjustmentDate: string;
  adjustedBy?: { fullName: string };
  approvedBy?: { fullName: string };
}

export function AdjustmentsPage() {
  const { t, brand, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    adjustmentType: 'Decrease Stock',
    quantity: 1,
    directionOverride: 'OUT' as 'IN' | 'OUT',
    reason: '',
    notes: '',
  });

  const canCreate = hasPermission('ADJUSTMENT_CREATE');
  const canApprove = hasPermission('ADJUSTMENT_APPROVE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adjRes, whRes, prodRes] = await Promise.all([
        apiRequest<{ adjustments: AdjustmentRow[] }>('/api/adjustments'),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ products: Array<{ _id: string; name: string; sku: string }> }>('/api/products'),
      ]);
      setAdjustments(adjRes.adjustments);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load adjustments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          approveNow: canApprove,
        }),
      });
      showSuccess('Stock adjustment recorded permanently.');
      setOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create adjustment');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiRequest(`/api/adjustments/${id}/approve`, { method: 'POST' });
      showSuccess('Adjustment approved and inventory updated.');
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to approve adjustment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Every adjustment is permanently logged in the Stock Ledger and Audit Log.
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setForm({
                warehouseId: user?.assignedWarehouseId || warehouses[0]?._id || '',
                productId: products[0]?._id || '',
                adjustmentType: 'Decrease Stock',
                quantity: 1,
                directionOverride: 'OUT',
                reason: '',
                notes: '',
              });
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Adjustment</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : adjustments.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Adj #</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.date}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.warehouse}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                  <th className="text-left font-semibold px-4 py-3">Type</th>
                  <th className="text-right font-semibold px-4 py-3">Prev</th>
                  <th className="text-right font-semibold px-4 py-3">Delta</th>
                  <th className="text-right font-semibold px-4 py-3">New</th>
                  <th className="text-left font-semibold px-4 py-3">Reason</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adjustments.map((a) => (
                  <tr key={a._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582]">{a.adjustmentNumber}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {formatDate(a.adjustmentDate, brand.dateFormat)}
                    </td>
                    <td className="px-4 py-3">{a.warehouseId?.name}</td>
                    <td className="px-4 py-3 font-medium">{a.productId?.name}</td>
                    <td className="px-4 py-3">{a.adjustmentType}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatNumber(a.previousQuantity)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-semibold ${
                        a.adjustmentQuantity >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {a.adjustmentQuantity >= 0 ? `+${a.adjustmentQuantity}` : a.adjustmentQuantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">{formatNumber(a.newQuantity)}</td>
                    <td className="px-4 py-3 text-slate-600">{a.reason}</td>
                    <td className="px-4 py-3">
                      <StatusLabel status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'Pending' && canApprove && (
                        <button
                          type="button"
                          onClick={() => handleApprove(a._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded"
                        >
                          <Check className="w-3 h-3" />
                          <span>Approve</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Stock Adjustment" maxWidth="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.warehouse}</label>
              <select
                required
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.product}</label>
              <select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Adjustment Type</label>
              <select
                value={form.adjustmentType}
                onChange={(e) => setForm({ ...form, adjustmentType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="Increase Stock">Increase Stock</option>
                <option value="Decrease Stock">Decrease Stock</option>
                <option value="Damaged Stock">Damaged Stock</option>
                <option value="Lost Stock">Lost Stock</option>
                <option value="Physical Count Correction">Physical Count Correction</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            {form.adjustmentType === 'Physical Count Correction' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Direction</label>
                <select
                  value={form.directionOverride}
                  onChange={(e) => setForm({ ...form, directionOverride: e.target.value as 'IN' | 'OUT' })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="IN">Increase (+)</option>
                  <option value="OUT">Decrease (-)</option>
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason (Required)</label>
              <input
                type="text"
                required
                minLength={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md"
            >
              {saving ? '...' : canApprove ? 'Apply Adjustment' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
