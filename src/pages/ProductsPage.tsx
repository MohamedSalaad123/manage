import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Eye, Pencil, Package, Upload, Tag } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

const STANDARD_UNITS = ['Piece', 'Box', 'Carton', 'Meter', 'Kilogram', 'Liter', 'Bag', 'Roll'];

interface CategoryRow {
  _id: string;
  name: string;
  code: string;
  description: string;
}

interface ProductRow {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: { _id: string; name: string; code: string } | string;
  brand: string;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  minStockLevel: number;
  imageUrl: string;
  description: string;
  status: 'Active' | 'Inactive';
  globalQuantity: number;
  globalValuation: number;
  warehouseCount: number;
}

interface ProductDetail {
  product: ProductRow;
  totalQuantity: number;
  totalValuation: number;
  warehouseStocks: Array<{
    _id: string;
    availableQty: number;
    reservedQty: number;
    averageCost: number;
    totalValue: number;
    warehouseId: { _id: string; name: string; code: string; location: string };
  }>;
  history: Array<{
    _id: string;
    transactionNumber: string;
    movementType: string;
    quantityIn: number;
    quantityOut: number;
    newQuantity: number;
    transactionDate: string;
    warehouseId?: { name: string };
    performedBy?: { fullName: string };
  }>;
}

export function ProductsPage() {
  const { t, language, brand, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [formOpen, setFormOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [customUnitMode, setCustomUnitMode] = useState(false);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    categoryId: '',
    brand: '',
    unit: 'Bag',
    purchasePrice: 0,
    sellingPrice: 0,
    minStockLevel: 20,
    imageUrl: '',
    description: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  const [catForm, setCatForm] = useState({ name: '', code: '', description: '' });

  const canManage = hasPermission('PRODUCT_MANAGE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter !== 'ALL') params.set('categoryId', categoryFilter);

      const [prodRes, catRes] = await Promise.all([
        apiRequest<{ products: ProductRow[] }>(`/api/products?${params.toString()}`),
        apiRequest<{ categories: CategoryRow[] }>('/api/categories'),
      ]);
      setProducts(prodRes.products);
      setCategories(catRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setCustomUnitMode(false);
    setForm({
      name: '',
      sku: '',
      barcode: '',
      categoryId: categories[0]?._id || '',
      brand: '',
      unit: 'Bag',
      purchasePrice: 0,
      sellingPrice: 0,
      minStockLevel: 20,
      imageUrl: '',
      description: '',
      status: 'Active',
    });
    setFormOpen(true);
  };

  const openEdit = (p: ProductRow) => {
    setEditing(p);
    const isStd = STANDARD_UNITS.includes(p.unit);
    setCustomUnitMode(!isStd);
    const catId = typeof p.categoryId === 'object' ? p.categoryId._id : p.categoryId;
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      categoryId: catId || '',
      brand: p.brand || '',
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      minStockLevel: p.minStockLevel,
      imageUrl: p.imageUrl || '',
      description: p.description || '',
      status: p.status,
    });
    setFormOpen(true);
  };

  const openDetail = async (p: ProductRow) => {
    try {
      const res = await apiRequest<ProductDetail>(`/api/products/${p._id}`);
      setDetail(res);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load product details');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((prev) => ({ ...prev, imageUrl: url }));
      showSuccess('Product image uploaded.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        purchasePrice: Number(form.purchasePrice),
        sellingPrice: Number(form.sellingPrice),
        minStockLevel: Number(form.minStockLevel),
      };
      if (editing) {
        await apiRequest(`/api/products/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showSuccess(language === 'so' ? 'Alaabta waa la cusbooneysiiyay.' : 'Product updated.');
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showSuccess(language === 'so' ? 'Alaab cusub waa la daray.' : 'Product created.');
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      setCatForm({ name: '', code: '', description: '' });
      showSuccess('Category created.');
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create category');
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allCategories}</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCatOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{language === 'so' ? 'Qaybaha' : 'Categories'}</span>
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'so' ? 'Ku Dar Alaab' : 'Add Product'}</span>
            </button>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <EmptyState
            title={t.common.noData}
            actionLabel={canManage ? (language === 'so' ? 'Ku Dar Alaab' : 'Add Product') : undefined}
            onAction={canManage ? openCreate : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">SKU</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.product}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.category}</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.unit}</th>
                  <th className="text-right font-semibold px-4 py-3">Purchase</th>
                  <th className="text-right font-semibold px-4 py-3">Selling</th>
                  <th className="text-right font-semibold px-4 py-3">Global Qty</th>
                  <th className="text-right font-semibold px-4 py-3">Valuation</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const catName = typeof p.categoryId === 'object' ? p.categoryId?.name : '-';
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-semibold text-[#245582] whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-slate-900">{p.name}</p>
                            {p.brand && <p className="text-[11px] text-slate-500">{p.brand}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{catName}</td>
                      <td className="px-4 py-3 text-slate-700">{p.unit}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(p.purchasePrice, brand.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatCurrency(p.sellingPrice, brand.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {formatNumber(p.globalQuantity)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(p.globalValuation, brand.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(p)}
                            className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                            title={t.common.view}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                              title={t.common.edit}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Product' : 'Add Product to Central Catalog'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Product Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">SKU / Product Code</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Barcode</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">{t.common.category}</label>
              <select
                required
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">-- Select Category --</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unit of Measurement</label>
              {!customUnitMode ? (
                <select
                  value={form.unit}
                  onChange={(e) => {
                    if (e.target.value === '__CUSTOM__') {
                      setCustomUnitMode(true);
                      setForm({ ...form, unit: '' });
                    } else {
                      setForm({ ...form, unit: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {STANDARD_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                  <option value="__CUSTOM__">Other Custom Unit...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="e.g. Ton, Pallet"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomUnitMode(false);
                      setForm({ ...form, unit: 'Piece' });
                    }}
                    className="px-2.5 text-xs border border-slate-300 rounded-md"
                  >
                    List
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Minimum Stock Level</label>
              <input
                type="number"
                min={0}
                required
                value={form.minStockLevel}
                onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Purchase Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Selling Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Product Image</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="/uploads/... or leave blank"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-md"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 rounded-md cursor-pointer hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? '...' : 'Upload'}</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
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

      {/* Categories Manager Modal */}
      <Modal open={catOpen} onClose={() => setCatOpen(false)} title="Product Categories" maxWidth="lg">
        <form onSubmit={handleCreateCategory} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          <input
            type="text"
            required
            placeholder="Category Name"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            className="px-3 py-2 text-xs border border-slate-300 rounded-md"
          />
          <input
            type="text"
            required
            placeholder="Code (e.g. CAT-ELC)"
            value={catForm.code}
            onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
            className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-md"
          />
          <button
            type="submit"
            className="px-3 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368]"
          >
            Add Category
          </button>
        </form>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
          {categories.map((c) => (
            <div key={c._id} className="px-3 py-2.5 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900">{c.name}</span>
                {c.description && <p className="text-slate-500">{c.description}</p>}
              </div>
              <span className="font-mono text-slate-500">{c.code}</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* Product Detail Modal: Multi-Warehouse Stock & History */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.product.name} (${detail.product.sku})` : ''}
        subtitle={detail ? `Unit: ${detail.product.unit} · Min Stock: ${detail.product.minStockLevel}` : ''}
        maxWidth="4xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Global Stock Quantity</p>
                <p className="text-base font-bold font-mono tabular-nums mt-1">
                  {formatNumber(detail.totalQuantity)} {detail.product.unit}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Global Valuation</p>
                <p className="text-base font-bold font-mono tabular-nums mt-1">
                  {formatCurrency(detail.totalValuation, brand.currency)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Catalog Purchase Price</p>
                <p className="text-base font-bold font-mono tabular-nums mt-1">
                  {formatCurrency(detail.product.purchasePrice, brand.currency)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-500">Selling Price</p>
                <p className="text-base font-bold font-mono tabular-nums mt-1">
                  {formatCurrency(detail.product.sellingPrice, brand.currency)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#0B192C] mb-2">Stock Across All Warehouses</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">Warehouse</th>
                      <th className="text-left px-3 py-2">Location</th>
                      <th className="text-right px-3 py-2">Available</th>
                      <th className="text-right px-3 py-2">Reserved</th>
                      <th className="text-right px-3 py-2">Avg Cost</th>
                      <th className="text-right px-3 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.warehouseStocks.map((ws) => (
                      <tr key={ws._id}>
                        <td className="px-3 py-2 font-medium">
                          {ws.warehouseId.name} ({ws.warehouseId.code})
                        </td>
                        <td className="px-3 py-2 text-slate-600">{ws.warehouseId.location}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                          {formatNumber(ws.availableQty)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatNumber(ws.reservedQty)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatCurrency(ws.averageCost, brand.currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(ws.totalValue, brand.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#0B192C] mb-2">Movement History</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-md max-h-56">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Tx #</th>
                      <th className="text-left px-3 py-2">Warehouse</th>
                      <th className="text-left px-3 py-2">Movement</th>
                      <th className="text-right px-3 py-2">In / Out</th>
                      <th className="text-right px-3 py-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.history.map((h) => (
                      <tr key={h._id}>
                        <td className="px-3 py-2 font-mono">{formatDate(h.transactionDate, brand.dateFormat)}</td>
                        <td className="px-3 py-2 font-mono">{h.transactionNumber}</td>
                        <td className="px-3 py-2">{h.warehouseId?.name}</td>
                        <td className="px-3 py-2">{h.movementType}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {h.quantityIn > 0 ? `+${h.quantityIn}` : `-${h.quantityOut}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{h.newQuantity}</td>
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
