import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, XCircle, Truck, PackageCheck, Eye } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface TransferRow {
  _id: string;
  transferNumber: string;
  sourceWarehouseId: { _id: string; name: string; code: string };
  destinationWarehouseId: { _id: string; name: string; code: string };
  productId: { _id: string; name: string; sku: string; unit: string };
  quantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  transferDate: string;
  status: string;
  notes: string;
  rejectionReason?: string;
  requestedBy?: { fullName: string };
  approvedBy?: { fullName: string };
  receiptLogs: Array<{
    receivedQty: number;
    damagedQty: number;
    missingQty: number;
    notes: string;
    receivedAt: string;
  }>;
}

export function TransfersPage() {
  const { t, language, brand, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string; unit: string }>>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [createOpen, setCreateOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<TransferRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TransferRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<TransferRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    sourceWarehouseId: '',
    destinationWarehouseId: '',
    productId: '',
    quantity: 1,
    notes: '',
    saveAsDraft: false,
  });

  const [receiveForm, setReceiveForm] = useState({
    receivedQty: 0,
    damagedQty: 0,
    missingQty: 0,
    notes: '',
  });

  const [rejectReason, setRejectReason] = useState('');

  const canCreate = hasPermission('TRANSFER_CREATE');
  const canApprove = hasPermission('TRANSFER_APPROVE');
  const canDispatch = hasPermission('TRANSFER_DISPATCH');
  const canReceive = hasPermission('TRANSFER_RECEIVE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const [trfRes, whRes, prodRes, invRes] = await Promise.all([
        apiRequest<{ transfers: TransferRow[] }>(`/api/transfers?${params.toString()}`),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ products: Array<{ _id: string; name: string; sku: string; unit: string }> }>('/api/products'),
        apiRequest<{ items: Array<{ warehouseId: string; productId: string; availableQty: number }> }>('/api/inventory'),
      ]);
      setTransfers(trfRes.transfers);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);
      const map = new Map<string, number>();
      for (const i of invRes.items) {
        map.set(`${i.warehouseId}:${i.productId}`, i.availableQty);
      }
      setInventoryMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    const src = user?.assignedWarehouseId || warehouses[0]?._id || '';
    const dst = warehouses.find((w) => w._id !== src)?._id || '';
    setForm({
      sourceWarehouseId: src,
      destinationWarehouseId: dst,
      productId: products[0]?._id || '',
      quantity: 1,
      notes: '',
      saveAsDraft: false,
    });
    setCreateOpen(true);
  };

  const sourceAvail = inventoryMap.get(`${form.sourceWarehouseId}:${form.productId}`) ?? 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.sourceWarehouseId === form.destinationWarehouseId) {
      showError('Source and destination warehouses cannot be the same.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      });
      showSuccess('Transfer request created.');
      setCreateOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create transfer');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id: string, action: 'submit' | 'approve' | 'dispatch' | 'cancel') => {
    setSaving(true);
    try {
      await apiRequest(`/api/transfers/${id}/${action}`, { method: 'POST' });
      showSuccess(`Transfer ${action}ed successfully.`);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to ${action} transfer`);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/transfers/${rejectTarget._id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      showSuccess('Transfer rejected.');
      setRejectTarget(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reject transfer');
    } finally {
      setSaving(false);
    }
  };

  const openReceive = (trf: TransferRow) => {
    const remaining = Math.max(
      0,
      trf.dispatchedQuantity - (trf.receivedQuantity + trf.damagedQuantity + trf.missingQuantity)
    );
    setReceiveTarget(trf);
    setReceiveForm({
      receivedQty: remaining,
      damagedQty: 0,
      missingQty: 0,
      notes: '',
    });
  };

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/transfers/${receiveTarget._id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          receivedQty: Number(receiveForm.receivedQty),
          damagedQty: Number(receiveForm.damagedQty),
          missingQty: Number(receiveForm.missingQty),
          notes: receiveForm.notes,
        }),
      });
      showSuccess('Transfer receipt recorded and destination inventory updated.');
      setReceiveTarget(null);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to record receipt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
        >
          <option value="ALL">{t.common.allStatuses}</option>
          {[
            'Draft',
            'Pending Approval',
            'Approved',
            'In Transit',
            'Partially Received',
            'Completed',
            'Rejected',
            'Cancelled',
          ].map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'so' ? 'Codso Wareejin Cusub' : 'New Transfer Request'}</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : transfers.length === 0 ? (
          <EmptyState
            title={t.common.noData}
            actionLabel={canCreate ? (language === 'so' ? 'Codso Wareejin' : 'Create Transfer') : undefined}
            onAction={canCreate ? openCreate : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Transfer #</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.date}</th>
                  <th className="text-left font-semibold px-4 py-3">Source</th>
                  <th className="text-left font-semibold px-4 py-3">Destination</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                  <th className="text-right font-semibold px-4 py-3">Requested</th>
                  <th className="text-right font-semibold px-4 py-3">Received</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((trf) => (
                  <tr key={trf._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582] whitespace-nowrap">
                      {trf.transferNumber}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDate(trf.transferDate, brand.dateFormat)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{trf.sourceWarehouseId?.name}</td>
                    <td className="px-4 py-3 text-slate-700">{trf.destinationWarehouseId?.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {trf.productId?.name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(trf.quantity)} {trf.productId?.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatNumber(trf.receivedQuantity)}
                      {trf.damagedQuantity > 0 ? ` (Dmg: ${trf.damagedQuantity})` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={trf.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(trf)}
                          title={t.common.view}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {trf.status === 'Draft' && canCreate && (
                          <button
                            type="button"
                            onClick={() => runAction(trf._id, 'submit')}
                            className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Submit
                          </button>
                        )}
                        {trf.status === 'Pending Approval' && canApprove && (
                          <>
                            <button
                              type="button"
                              onClick={() => runAction(trf._id, 'approve')}
                              title={t.common.approve}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectTarget(trf)}
                              title={t.common.reject}
                              className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {trf.status === 'Approved' && canDispatch && (
                          <button
                            type="button"
                            onClick={() => runAction(trf._id, 'dispatch')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#245582] text-white rounded hover:bg-[#1B4368]"
                          >
                            <Truck className="w-3 h-3" />
                            <span>Dispatch</span>
                          </button>
                        )}
                        {['In Transit', 'Partially Received'].includes(trf.status) && canReceive && (
                          <button
                            type="button"
                            onClick={() => openReceive(trf)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded hover:bg-emerald-800"
                          >
                            <PackageCheck className="w-3 h-3" />
                            <span>Receive</span>
                          </button>
                        )}
                        {['Draft', 'Pending Approval', 'Approved'].includes(trf.status) && canCreate && (
                          <button
                            type="button"
                            onClick={() => runAction(trf._id, 'cancel')}
                            className="px-2 py-1 text-[11px] text-slate-600 hover:text-red-700"
                          >
                            Cancel
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

      {/* Create Transfer Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Warehouse Transfer" maxWidth="xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Source Warehouse</label>
              <select
                required
                value={form.sourceWarehouseId}
                onChange={(e) => setForm({ ...form, sourceWarehouseId: e.target.value })}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Destination Warehouse</label>
              <select
                required
                value={form.destinationWarehouseId}
                onChange={(e) => setForm({ ...form, destinationWarehouseId: e.target.value })}
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
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Quantity (Available in source: {formatNumber(sourceAvail)})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={sourceAvail > 0 ? sourceAvail : undefined}
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
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

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.saveAsDraft}
                onChange={(e) => setForm({ ...form, saveAsDraft: e.target.checked })}
              />
              <span>Save as Draft before submitting</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
              >
                {saving ? '...' : form.saveAsDraft ? 'Save Draft' : 'Submit Transfer Request'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Receive / Partial Receipt Modal */}
      <Modal
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={receiveTarget ? `Confirm Receipt (${receiveTarget.transferNumber})` : ''}
        subtitle={
          receiveTarget
            ? `Dispatched: ${receiveTarget.dispatchedQuantity} · Already Accounted: ${
                receiveTarget.receivedQuantity + receiveTarget.damagedQuantity + receiveTarget.missingQuantity
              }`
            : ''
        }
        maxWidth="lg"
      >
        {receiveTarget && (
          <form onSubmit={handleReceive} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Good Received Qty</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={receiveForm.receivedQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, receivedQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Damaged Qty</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={receiveForm.damagedQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, damagedQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Missing Qty</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={receiveForm.missingQty}
                  onChange={(e) => setReceiveForm({ ...receiveForm, missingQty: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Receipt Notes</label>
              <textarea
                rows={2}
                value={receiveForm.notes}
                onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiveTarget(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
              >
                Confirm Receipt
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={`Reject Transfer ${rejectTarget?.transferNumber || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleReject} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Rejection Reason</label>
            <input
              type="text"
              required
              minLength={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-red-700 text-white rounded-md"
            >
              {t.common.reject}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail & Receipt Logs Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={detailTarget ? `Transfer ${detailTarget.transferNumber}` : ''}
        maxWidth="2xl"
      >
        {detailTarget && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div>
                <span className="text-slate-500">From:</span> <strong>{detailTarget.sourceWarehouseId?.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">To:</span> <strong>{detailTarget.destinationWarehouseId?.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Product:</span> <strong>{detailTarget.productId?.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Status:</span> <StatusLabel status={detailTarget.status} />
              </div>
              <div>
                <span className="text-slate-500">Requested:</span>{' '}
                <strong className="font-mono">{detailTarget.quantity}</strong>
              </div>
              <div>
                <span className="text-slate-500">Received / Damaged / Missing:</span>{' '}
                <strong className="font-mono">
                  {detailTarget.receivedQuantity} / {detailTarget.damagedQuantity} / {detailTarget.missingQuantity}
                </strong>
              </div>
            </div>

            {detailTarget.receiptLogs?.length > 0 && (
              <div>
                <h4 className="font-semibold text-slate-900 mb-2">Receipt History</h4>
                <table className="w-full border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Received</th>
                      <th className="text-right p-2">Damaged</th>
                      <th className="text-right p-2">Missing</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailTarget.receiptLogs.map((log, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-mono">{formatDate(log.receivedAt, brand.dateFormat)}</td>
                        <td className="p-2 text-right font-mono">{log.receivedQty}</td>
                        <td className="p-2 text-right font-mono">{log.damagedQty}</td>
                        <td className="p-2 text-right font-mono">{log.missingQty}</td>
                        <td className="p-2">{log.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
