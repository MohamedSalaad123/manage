import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, CheckCircle2, Printer } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface StockOutRow {
  _id: string;
  transactionNumber: string;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  warehouseId: { _id: string; name: string; code: string };
  productId: { _id: string; name: string; sku: string; unit: string };
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  destinationCustomer: string;
  referenceNumber: string;
  reason: string;
  notes: string;
  transactionDate: string;
  performedBy?: { fullName: string };
  confirmedBy?: { fullName: string };
}

export function StockOutPage() {
  const { t, language, brand, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [transactions, setTransactions] = useState<StockOutRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string; unit: string }>>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<StockOutRow | null>(null);
  const [voucherTx, setVoucherTx] = useState<StockOutRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    quantity: 1,
    destinationCustomer: '',
    referenceNumber: '',
    reason: 'Project Site Issuance',
    transactionDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const canCreate = hasPermission('STOCK_OUT_CREATE');
  const canConfirm = hasPermission('STOCK_OUT_CONFIRM');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const [txRes, whRes, prodRes, invRes] = await Promise.all([
        apiRequest<{ transactions: StockOutRow[] }>(`/api/stock-out?${params.toString()}`),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ products: Array<{ _id: string; name: string; sku: string; unit: string }> }>('/api/products'),
        apiRequest<{ items: Array<{ warehouseId: string; productId: string; availableQty: number }> }>('/api/inventory'),
      ]);
      setTransactions(txRes.transactions);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);

      const map = new Map<string, number>();
      for (const i of invRes.items) {
        map.set(`${i.warehouseId}:${i.productId}`, i.availableQty);
      }
      setInventoryMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Stock Out records');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setForm({
      warehouseId: user?.assignedWarehouseId || warehouses[0]?._id || '',
      productId: products[0]?._id || '',
      quantity: 1,
      destinationCustomer: '',
      referenceNumber: '',
      reason: 'Project Site Issuance',
      transactionDate: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setFormOpen(true);
  };

  const selectedAvail = inventoryMap.get(`${form.warehouseId}:${form.productId}`) ?? 0;

  const handleSubmit = async (confirmNow: boolean) => {
    if (form.quantity > selectedAvail) {
      showError(`Negative inventory prevented. Available quantity is ${selectedAvail}.`);
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/stock-out', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          confirmNow,
        }),
      });
      showSuccess(confirmNow ? 'Stock Out confirmed and inventory deducted.' : 'Stock Out draft saved.');
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Stock Out failed');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/stock-out/${confirmTarget._id}/confirm`, { method: 'POST' });
      showSuccess('Stock Out confirmed.');
      setConfirmTarget(null);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to confirm Stock Out');
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

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'so' ? 'Bixi Alaab (Stock Out)' : 'Issue Stock Out'}</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : transactions.length === 0 ? (
          <EmptyState
            title={t.common.noData}
            actionLabel={canCreate ? (language === 'so' ? 'Bixi Alaab' : 'Create Stock Out') : undefined}
            onAction={canCreate ? openCreate : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Tx #</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.date}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.warehouse}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                  <th className="text-left font-semibold px-4 py-3">Destination / Customer</th>
                  <th className="text-left font-semibold px-4 py-3">Reason</th>
                  <th className="text-right font-semibold px-4 py-3">Qty Issued</th>
                  <th className="text-right font-semibold px-4 py-3">Cost Value</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582] whitespace-nowrap">
                      {tx.transactionNumber}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDate(tx.transactionDate, brand.dateFormat)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tx.warehouseId?.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{tx.productId?.name}</td>
                    <td className="px-4 py-3 text-slate-700">{tx.destinationCustomer}</td>
                    <td className="px-4 py-3 text-slate-600">{tx.reason}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(tx.quantity)} {tx.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(tx.totalAmount, brand.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={tx.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setVoucherTx(tx)}
                          title={t.common.print}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {tx.status === 'Draft' && canConfirm && (
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(tx)}
                            title="Confirm Stock Out"
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
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

      {/* Create Stock Out Modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Issue Stock Out" maxWidth="2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(canConfirm);
          }}
          className="space-y-4"
        >
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
                    {w.name} ({w.code})
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

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <p className="text-[11px] text-slate-500">Available Quantity in Warehouse</p>
              <p
                className={`text-base font-bold font-mono tabular-nums mt-0.5 ${
                  selectedAvail <= 0 ? 'text-red-700' : 'text-[#0B192C]'
                }`}
              >
                {formatNumber(selectedAvail)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Requested Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedAvail > 0 ? selectedAvail : undefined}
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Destination / Customer</label>
              <input
                type="text"
                required
                value={form.destinationCustomer}
                onChange={(e) => setForm({ ...form, destinationCustomer: e.target.value })}
                placeholder="e.g. Hodan Construction Site"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reference Number</label>
              <input
                type="text"
                value={form.referenceNumber}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
              <input
                type="text"
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.date}</label>
              <input
                type="date"
                required
                value={form.transactionDate}
                onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
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

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md text-slate-700"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 text-xs font-semibold border border-[#245582] text-[#245582] rounded-md"
            >
              Save Draft
            </button>
            {canConfirm && (
              <button
                type="submit"
                disabled={saving || selectedAvail <= 0}
                className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368] disabled:opacity-50"
              >
                Confirm Stock Out
              </button>
            )}
          </div>
        </form>
      </Modal>

      {/* Print Voucher Modal */}
      <Modal open={Boolean(voucherTx)} onClose={() => setVoucherTx(null)} title="Stock Out Voucher" maxWidth="lg">
        {voucherTx && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-slate-200 pb-3 flex justify-between">
              <div>
                <p className="font-bold text-sm text-[#0B192C]">{brand.companyName}</p>
                <p className="text-slate-500">Official Stock Issuance Voucher</p>
              </div>
              <div className="text-right font-mono">
                <p className="font-bold">{voucherTx.transactionNumber}</p>
                <p>{formatDate(voucherTx.transactionDate, brand.dateFormat)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500">Warehouse:</span> <strong>{voucherTx.warehouseId?.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Destination:</span> <strong>{voucherTx.destinationCustomer}</strong>
              </div>
              <div>
                <span className="text-slate-500">Issued By:</span> <strong>{voucherTx.performedBy?.fullName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Reason:</span> <strong>{voucherTx.reason}</strong>
              </div>
            </div>
            <table className="w-full border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Quantity Issued</th>
                  <th className="text-right p-2">Cost Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2">{voucherTx.productId?.name}</td>
                  <td className="p-2 text-right font-mono font-bold">
                    {voucherTx.quantity} {voucherTx.unit}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {formatCurrency(voucherTx.totalAmount, brand.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-end no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#245582] text-white rounded-md font-semibold"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{t.common.print}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmDraft}
        title="Confirm Stock Out"
        message={
          confirmTarget
            ? `Confirm issuing ${confirmTarget.quantity} ${confirmTarget.unit} of ${confirmTarget.productId?.name} from ${confirmTarget.warehouseId?.name}?`
            : ''
        }
        confirmLabel={t.common.confirm}
        cancelLabel={t.common.cancel}
        loading={saving}
      />
    </div>
  );
}
