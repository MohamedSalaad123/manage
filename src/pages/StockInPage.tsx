import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, CheckCircle2, Pencil, Printer, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api';
import { exportToExcel, formatCurrency, formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface StockInRow {
  _id: string;
  transactionNumber: string;
  movementType: string;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  warehouseId: { _id: string; name: string; code: string };
  productId: { _id: string; name: string; sku: string; unit: string };
  supplierId?: { _id: string; supplierName: string; companyName: string } | null;
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  invoiceNumber: string;
  notes: string;
  attachmentUrl: string;
  transactionDate: string;
  performedBy?: { fullName: string };
  confirmedBy?: { fullName: string };
}

export function StockInPage() {
  const { t, language, brand, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [transactions, setTransactions] = useState<StockInRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string; unit: string; purchasePrice: number }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; supplierName: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockInRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<StockInRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockInRow | null>(null);
  const [receiptTx, setReceiptTx] = useState<StockInRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    warehouseId: '',
    productId: '',
    quantity: 1,
    unit: 'Bag',
    purchasePrice: 0,
    supplierId: '',
    invoiceNumber: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    notes: '',
    attachmentUrl: '',
  });

  const canCreate = hasPermission('STOCK_IN_CREATE');
  const canConfirm = hasPermission('STOCK_IN_CONFIRM');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const [txRes, whRes, prodRes, supRes] = await Promise.all([
        apiRequest<{ transactions: StockInRow[] }>(`/api/stock-in?${params.toString()}`),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ products: Array<{ _id: string; name: string; sku: string; unit: string; purchasePrice: number }> }>('/api/products'),
        apiRequest<{ suppliers: Array<{ _id: string; supplierName: string }> }>('/api/suppliers'),
      ]);
      setTransactions(txRes.transactions);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);
      setSuppliers(supRes.suppliers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Stock In records');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    const defaultWh = user?.assignedWarehouseId || warehouses[0]?._id || '';
    const defaultProd = products[0];
    setForm({
      warehouseId: defaultWh,
      productId: defaultProd?._id || '',
      quantity: 1,
      unit: defaultProd?.unit || 'Piece',
      purchasePrice: defaultProd?.purchasePrice || 0,
      supplierId: suppliers[0]?._id || '',
      invoiceNumber: '',
      transactionDate: new Date().toISOString().slice(0, 10),
      notes: '',
      attachmentUrl: '',
    });
    setFormOpen(true);
  };

  const openEdit = (tx: StockInRow) => {
    setEditing(tx);
    setForm({
      warehouseId: tx.warehouseId._id,
      productId: tx.productId._id,
      quantity: tx.quantity,
      unit: tx.unit,
      purchasePrice: tx.unitCost,
      supplierId: tx.supplierId?._id || '',
      invoiceNumber: tx.invoiceNumber || '',
      transactionDate: new Date(tx.transactionDate).toISOString().slice(0, 10),
      notes: tx.notes || '',
      attachmentUrl: tx.attachmentUrl || '',
    });
    setFormOpen(true);
  };

  const handleProductChange = (pid: string) => {
    const p = products.find((item) => item._id === pid);
    setForm((prev) => ({
      ...prev,
      productId: pid,
      unit: p?.unit || prev.unit,
      purchasePrice: p?.purchasePrice ?? prev.purchasePrice,
    }));
  };

  const handleAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((prev) => ({ ...prev, attachmentUrl: url }));
      showSuccess('Attachment uploaded.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Attachment upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveTransaction = async (confirmNow: boolean) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        purchasePrice: Number(form.purchasePrice),
        supplierId: form.supplierId || null,
        confirmNow,
      };
      if (editing) {
        await apiRequest(`/api/stock-in/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (confirmNow) {
          await apiRequest(`/api/stock-in/${editing._id}/confirm`, { method: 'POST' });
        }
        showSuccess(confirmNow ? 'Stock In confirmed & inventory updated.' : 'Draft updated.');
      } else {
        await apiRequest('/api/stock-in', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showSuccess(confirmNow ? 'Stock In confirmed & inventory updated.' : 'Stock In draft saved.');
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save Stock In');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/stock-in/${confirmTarget._id}/confirm`, { method: 'POST' });
      showSuccess('Stock In confirmed and inventory valuation updated.');
      setConfirmTarget(null);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to confirm Stock In');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/stock-in/${deleteTarget._id}`, { method: 'DELETE' });
      showSuccess('Draft deleted.');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Cannot delete transaction');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    exportToExcel(
      'khayre_stock_in_report',
      'Stock In',
      transactions.map((tx) => ({
        TransactionNumber: tx.transactionNumber,
        Date: formatDate(tx.transactionDate, brand.dateFormat),
        Warehouse: tx.warehouseId?.name,
        Product: tx.productId?.name,
        SKU: tx.productId?.sku,
        Quantity: tx.quantity,
        Unit: tx.unit,
        UnitCostUSD: tx.unitCost,
        TotalUSD: tx.totalAmount,
        Supplier: tx.supplierId?.supplierName || '-',
        Invoice: tx.invoiceNumber || '-',
        Status: tx.status,
      }))
    );
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
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allStatuses}</option>
            <option value="Draft">{t.common.draft}</option>
            <option value="Confirmed">{t.common.confirmed}</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t.common.exportExcel}</span>
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'so' ? 'Diiwaangeli Alaab Soo Gashay' : 'New Stock In'}</span>
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : transactions.length === 0 ? (
          <EmptyState
            title={t.common.noData}
            actionLabel={canCreate ? (language === 'so' ? 'Diiwaangeli Alaab Soo Gashay' : 'Create Stock In') : undefined}
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
                  <th className="text-left font-semibold px-4 py-3">Supplier / Inv</th>
                  <th className="text-right font-semibold px-4 py-3">Qty</th>
                  <th className="text-right font-semibold px-4 py-3">Unit Cost</th>
                  <th className="text-right font-semibold px-4 py-3">Total</th>
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
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {tx.productId?.name} <span className="font-mono text-slate-400">({tx.productId?.sku})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {tx.supplierId?.supplierName || '-'}
                      {tx.invoiceNumber ? ` · ${tx.invoiceNumber}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatNumber(tx.quantity)} {tx.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(tx.unitCost, brand.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(tx.totalAmount, brand.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={tx.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReceiptTx(tx)}
                          title={t.common.print}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {tx.status === 'Draft' && canCreate && (
                          <button
                            type="button"
                            onClick={() => openEdit(tx)}
                            title={t.common.edit}
                            className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {tx.status === 'Draft' && canConfirm && (
                          <button
                            type="button"
                            onClick={() => setConfirmTarget(tx)}
                            title="Confirm Stock In"
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {tx.status === 'Draft' && canCreate && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tx)}
                            title={t.common.delete}
                            className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Create / Edit Draft Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Stock In (${editing.transactionNumber})` : 'Register Stock In'}
        maxWidth="2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTransaction(false);
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
                onChange={(e) => handleProductChange(e.target.value)}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t.common.quantity} ({form.unit})
              </label>
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Supplier</label>
              <select
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">-- Optional --</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.supplierName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Invoice Number</label>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Attachment (Invoice / GRN)</label>
              <label className="flex items-center gap-2 px-3 py-2 text-xs border border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                <Upload className="w-4 h-4 text-slate-500" />
                <span className="truncate">
                  {uploading ? 'Uploading...' : form.attachmentUrl ? form.attachmentUrl : 'Upload PDF / Image'}
                </span>
                <input type="file" onChange={handleAttachment} className="hidden" />
              </label>
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

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-600">
              Line Total:{' '}
              <strong className="font-mono text-[#0B192C]">
                {formatCurrency(form.quantity * form.purchasePrice, brand.currency)}
              </strong>
            </p>
            <div className="flex items-center gap-2">
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
                className="px-4 py-2 text-xs font-semibold border border-[#245582] text-[#245582] rounded-md hover:bg-slate-50"
              >
                Save as Draft
              </button>
              {canConfirm && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveTransaction(true)}
                  className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
                >
                  Confirm Stock In
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Print Receipt Voucher Modal */}
      <Modal
        open={Boolean(receiptTx)}
        onClose={() => setReceiptTx(null)}
        title="Goods Received Voucher"
        maxWidth="lg"
      >
        {receiptTx && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-slate-200 pb-3 flex justify-between items-start">
              <div>
                <p className="font-bold text-sm text-[#0B192C]">{brand.companyName}</p>
                <p className="text-slate-500">Stock In Receipt Voucher</p>
              </div>
              <div className="text-right font-mono">
                <p className="font-bold">{receiptTx.transactionNumber}</p>
                <p className="text-slate-500">{formatDate(receiptTx.transactionDate, brand.dateFormat)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500">Warehouse:</span>{' '}
                <strong>{receiptTx.warehouseId?.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Status:</span> <strong>{receiptTx.status}</strong>
              </div>
              <div>
                <span className="text-slate-500">Supplier:</span>{' '}
                <strong>{receiptTx.supplierId?.supplierName || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Invoice #:</span>{' '}
                <strong className="font-mono">{receiptTx.invoiceNumber || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Received By:</span>{' '}
                <strong>{receiptTx.performedBy?.fullName || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Confirmed By:</span>{' '}
                <strong>{receiptTx.confirmedBy?.fullName || '-'}</strong>
              </div>
            </div>
            <table className="w-full border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Unit Cost</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2">
                    {receiptTx.productId?.name} ({receiptTx.productId?.sku})
                  </td>
                  <td className="p-2 text-right font-mono">
                    {receiptTx.quantity} {receiptTx.unit}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {formatCurrency(receiptTx.unitCost, brand.currency)}
                  </td>
                  <td className="p-2 text-right font-mono font-bold">
                    {formatCurrency(receiptTx.totalAmount, brand.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-end gap-2 pt-2 no-print">
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
        title="Confirm Stock In"
        message={
          confirmTarget
            ? `Confirming ${confirmTarget.transactionNumber} will add ${confirmTarget.quantity} ${confirmTarget.unit} of ${confirmTarget.productId?.name} to ${confirmTarget.warehouseId?.name} and post a permanent ledger entry.`
            : ''
        }
        confirmLabel={t.common.confirm}
        cancelLabel={t.common.cancel}
        loading={saving}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteDraft}
        title="Delete Unconfirmed Draft"
        message={`Delete draft ${deleteTarget?.transactionNumber}?`}
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
