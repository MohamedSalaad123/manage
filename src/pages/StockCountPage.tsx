import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Check, Send, XCircle, Eye } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface StockCountRow {
  _id: string;
  countNumber: string;
  warehouseId: { _id: string; name: string; code: string };
  countDate: string;
  status: string;
  notes: string;
  countedBy?: { fullName: string };
  approvedBy?: { fullName: string };
  items: Array<{
    productId: { _id: string; name: string; sku: string; unit: string };
    systemQuantity: number;
    physicalQuantity: number;
    difference: number;
    reason: string;
  }>;
}

export function StockCountPage() {
  const { t, brand, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [counts, setCounts] = useState<StockCountRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string; unit: string }>>([]);
  const [inventoryMap, setInventoryMap] = useState<Map<string, number>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<StockCountRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedWh, setSelectedWh] = useState('');
  const [notes, setNotes] = useState('');
  const [countItems, setCountItems] = useState<
    Array<{ productId: string; physicalQuantity: number; reason: string }>
  >([]);

  const canCreate = hasPermission('STOCK_COUNT_CREATE');
  const canApprove = hasPermission('STOCK_COUNT_APPROVE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cntRes, whRes, prodRes, invRes] = await Promise.all([
        apiRequest<{ stockCounts: StockCountRow[] }>('/api/stock-counts'),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ products: Array<{ _id: string; name: string; sku: string; unit: string }> }>('/api/products'),
        apiRequest<{ items: Array<{ warehouseId: string; productId: string; availableQty: number }> }>('/api/inventory'),
      ]);
      setCounts(cntRes.stockCounts);
      setWarehouses(whRes.warehouses);
      setProducts(prodRes.products);

      const map = new Map<string, number>();
      for (const i of invRes.items) {
        map.set(`${i.warehouseId}:${i.productId}`, i.availableQty);
      }
      setInventoryMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock counts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openStartCount = () => {
    const wh = user?.assignedWarehouseId || warehouses[0]?._id || '';
    setSelectedWh(wh);
    setNotes('');
    const initialItems = products.slice(0, 6).map((p) => ({
      productId: p._id,
      physicalQuantity: inventoryMap.get(`${wh}:${p._id}`) ?? 0,
      reason: '',
    }));
    setCountItems(initialItems);
    setCreateOpen(true);
  };

  const handleSaveCount = async (submitForApproval: boolean) => {
    if (countItems.length === 0) {
      showError('Select at least one product to count.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/stock-counts', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: selectedWh,
          notes,
          items: countItems.map((i) => ({
            productId: i.productId,
            physicalQuantity: Number(i.physicalQuantity),
            reason: i.reason,
          })),
          submitForApproval,
        }),
      });
      showSuccess(submitForApproval ? 'Stock count submitted for approval.' : 'Stock count saved.');
      setCreateOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save stock count');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'reject') => {
    setSaving(true);
    try {
      await apiRequest(`/api/stock-counts/${id}/${action}`, { method: 'POST' });
      showSuccess(`Stock count ${action}ed.`);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to ${action} stock count`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center justify-between">
        <p className="text-xs text-slate-600">
          Physical inventory counts never alter live stock until explicitly approved.
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={openStartCount}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Start New Stock Count</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : counts.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Count #</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.date}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.warehouse}</th>
                  <th className="text-right font-semibold px-4 py-3">Products</th>
                  <th className="text-left font-semibold px-4 py-3">Counted By</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map((sc) => (
                  <tr key={sc._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582]">{sc.countNumber}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {formatDate(sc.countDate, brand.dateFormat)}
                    </td>
                    <td className="px-4 py-3">{sc.warehouseId?.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{sc.items.length}</td>
                    <td className="px-4 py-3">{sc.countedBy?.fullName || '-'}</td>
                    <td className="px-4 py-3">
                      <StatusLabel status={sc.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(sc)}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {sc.status === 'In Progress' && canCreate && (
                          <button
                            type="button"
                            onClick={() => handleAction(sc._id, 'submit')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-slate-100 rounded"
                          >
                            <Send className="w-3 h-3" />
                            <span>Submit</span>
                          </button>
                        )}
                        {['In Progress', 'Pending Approval'].includes(sc.status) && canApprove && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAction(sc._id, 'approve')}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-emerald-700 text-white rounded"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve & Apply</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAction(sc._id, 'reject')}
                              className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                            >
                              <XCircle className="w-3.5 h-3.5" />
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

      {/* Start Stock Count Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Start Physical Stock Count" maxWidth="4xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.warehouse}</label>
              <select
                value={selectedWh}
                onChange={(e) => {
                  const wh = e.target.value;
                  setSelectedWh(wh);
                  setCountItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      physicalQuantity: inventoryMap.get(`${wh}:${item.productId}`) ?? 0,
                    }))
                  );
                }}
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
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.notes}</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Quarterly cycle count"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2">{t.common.product}</th>
                  <th className="text-right px-3 py-2">System Qty</th>
                  <th className="text-right px-3 py-2">Physical Qty</th>
                  <th className="text-right px-3 py-2">Difference</th>
                  <th className="text-left px-3 py-2">Adjustment Reason</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countItems.map((item, idx) => {
                  const sysQty = inventoryMap.get(`${selectedWh}:${item.productId}`) ?? 0;
                  const diff = Number((item.physicalQuantity - sysQty).toFixed(2));
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const next = [...countItems];
                            next[idx] = {
                              ...next[idx],
                              productId: pid,
                              physicalQuantity: inventoryMap.get(`${selectedWh}:${pid}`) ?? 0,
                            };
                            setCountItems(next);
                          }}
                          className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                        >
                          {products.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatNumber(sysQty)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.physicalQuantity}
                          onChange={(e) => {
                            const next = [...countItems];
                            next[idx].physicalQuantity = Number(e.target.value);
                            setCountItems(next);
                          }}
                          className="w-24 px-2 py-1 text-right font-mono border border-slate-300 rounded"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-semibold ${
                          diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.reason}
                          onChange={(e) => {
                            const next = [...countItems];
                            next[idx].reason = e.target.value;
                            setCountItems(next);
                          }}
                          placeholder="Reason if variance"
                          className="w-full px-2 py-1 border border-slate-300 rounded"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setCountItems(countItems.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                if (!products[0]) return;
                setCountItems([
                  ...countItems,
                  {
                    productId: products[0]._id,
                    physicalQuantity: inventoryMap.get(`${selectedWh}:${products[0]._id}`) ?? 0,
                    reason: '',
                  },
                ]);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50"
            >
              + Add Product Line
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveCount(false)}
                className="px-4 py-2 text-xs font-semibold border border-[#245582] text-[#245582] rounded-md"
              >
                Save In Progress
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSaveCount(true)}
                className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={detailTarget ? `Stock Count ${detailTarget.countNumber}` : ''}
        maxWidth="2xl"
      >
        {detailTarget && (
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div>
                <strong>{detailTarget.warehouseId?.name}</strong> ·{' '}
                {formatDate(detailTarget.countDate, brand.dateFormat)}
              </div>
              <StatusLabel status={detailTarget.status} />
            </div>
            <table className="w-full border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2">System Qty</th>
                  <th className="text-right p-2">Physical Qty</th>
                  <th className="text-right p-2">Difference</th>
                  <th className="text-left p-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailTarget.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2">{item.productId?.name}</td>
                    <td className="p-2 text-right font-mono">{item.systemQuantity}</td>
                    <td className="p-2 text-right font-mono">{item.physicalQuantity}</td>
                    <td
                      className={`p-2 text-right font-mono font-semibold ${
                        item.difference === 0
                          ? 'text-slate-500'
                          : item.difference > 0
                          ? 'text-emerald-700'
                          : 'text-red-700'
                      }`}
                    >
                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                    </td>
                    <td className="p-2">{item.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
