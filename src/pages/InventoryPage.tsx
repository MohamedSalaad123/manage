import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface InventoryItem {
  _id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  categoryName: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  availableQty: number;
  reservedQty: number;
  minStockLevel: number;
  purchasePrice: number;
  totalStockValue: number;
  stockStatus: string;
}

interface GlobalItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  categoryName: string;
  totalAvailableQty: number;
  totalReservedQty: number;
  weightedAverageCost: number;
  totalStockValue: number;
  minStockLevel: number;
  stockStatus: string;
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseCode: string;
    availableQty: number;
  }>;
}

export function InventoryPage() {
  const { t, language, brand, user } = useAuth();

  const [viewMode, setViewMode] = useState<'warehouse' | 'global'>('warehouse');
  const [warehouseId, setWarehouseId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [stockStatus, setStockStatus] = useState('ALL');
  const [search, setSearch] = useState('');

  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [globalItems, setGlobalItems] = useState<GlobalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSeeAllWarehouses =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'GENERAL_MANAGER' ||
    user?.role === 'ACCOUNTANT' ||
    user?.permissions.includes('WAREHOUSE_VIEW_ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: viewMode });
      if (warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
      if (categoryId !== 'ALL') params.set('categoryId', categoryId);
      if (stockStatus !== 'ALL') params.set('stockStatus', stockStatus);
      if (search) params.set('search', search);

      const [invRes, whRes, catRes] = await Promise.all([
        apiRequest<{ items: InventoryItem[]; globalItems: GlobalItem[] }>(
          `/api/inventory?${params.toString()}`
        ),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
        apiRequest<{ categories: Array<{ _id: string; name: string }> }>('/api/categories'),
      ]);
      setItems(invRes.items);
      setGlobalItems(invRes.globalItems);
      setWarehouses(whRes.warehouses);
      setCategories(catRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [viewMode, warehouseId, categoryId, stockStatus, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalValuation = items.reduce((sum, i) => sum + i.totalStockValue, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setViewMode('warehouse')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              viewMode === 'warehouse' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
            }`}
          >
            {language === 'so' ? 'Muuqaalka Bakhaarka' : 'Warehouse View'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('global')}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              viewMode === 'global' ? 'bg-white text-[#0B192C] shadow-xs' : 'text-slate-600'
            }`}
          >
            {language === 'so' ? 'Muuqaalka Guud (Global)' : 'Global View'}
          </button>
        </div>

        <div className="text-xs text-slate-600">
          Total Filtered Valuation:{' '}
          <span className="font-mono font-bold text-[#0B192C]">
            {formatCurrency(totalValuation, brand.currency)}
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>

        {canSeeAllWarehouses && (
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allWarehouses}</option>
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        )}

        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
        >
          <option value="ALL">{t.common.allCategories}</option>
          {categories.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={stockStatus}
          onChange={(e) => setStockStatus(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
        >
          <option value="ALL">{t.common.allStatuses}</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : viewMode === 'warehouse' ? (
          items.length === 0 ? (
            <EmptyState title={t.common.noData} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">SKU</th>
                    <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                    <th className="text-left font-semibold px-4 py-3">{t.common.warehouse}</th>
                    <th className="text-right font-semibold px-4 py-3">Available Qty</th>
                    <th className="text-right font-semibold px-4 py-3">Reserved Qty</th>
                    <th className="text-right font-semibold px-4 py-3">Min Level</th>
                    <th className="text-right font-semibold px-4 py-3">Avg Cost</th>
                    <th className="text-right font-semibold px-4 py-3">Total Value</th>
                    <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row) => (
                    <tr key={row._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-[#245582]">{row.sku}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.productName}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.warehouseName} ({row.warehouseCode})
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {formatNumber(row.availableQty)} {row.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {formatNumber(row.reservedQty)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">
                        {formatNumber(row.minStockLevel)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(row.purchasePrice, brand.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(row.totalStockValue, brand.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={row.stockStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : globalItems.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">SKU</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                  <th className="text-left font-semibold px-4 py-3">Warehouse Breakdown</th>
                  <th className="text-right font-semibold px-4 py-3">Global Available</th>
                  <th className="text-right font-semibold px-4 py-3">Weighted Avg Cost</th>
                  <th className="text-right font-semibold px-4 py-3">Global Value</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {globalItems.map((g) => (
                  <tr key={g.productId} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-[#245582]">{g.sku}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{g.productName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {g.warehouses.map((w) => (
                          <span key={w.warehouseId} className="font-mono text-[11px]">
                            {w.warehouseCode}: <strong>{formatNumber(w.availableQty)}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {formatNumber(g.totalAvailableQty)} {g.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatCurrency(g.weightedAverageCost, brand.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-bold text-[#0B192C]">
                      {formatCurrency(g.totalStockValue, brand.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusLabel status={g.stockStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
