import { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { exportToExcel, exportToPdf, formatCurrency, formatDate } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

const REPORT_TYPES = [
  { id: 'global-inventory', label: '1. Global Inventory Report' },
  { id: 'warehouse-stock', label: '2. Individual Warehouse Stock Report' },
  { id: 'stock-in', label: '3. Stock In Report' },
  { id: 'stock-out', label: '4. Stock Out Report' },
  { id: 'transfers', label: '5. Warehouse Transfer Report' },
  { id: 'low-stock', label: '6. Low Stock Report' },
  { id: 'out-of-stock', label: '7. Out of Stock Report' },
  { id: 'valuation', label: '8. Inventory Valuation Report' },
  { id: 'product-movement', label: '9. Product Movement & Stock Ledger' },
  { id: 'employee-activity', label: '10. Employee Activity Report' },
  { id: 'stock-counts', label: '11. Physical Stock Count Report' },
  { id: 'adjustments', label: '12. Stock Adjustment Report' },
];

export function ReportsPage() {
  const { t, brand, user, language, hasPermission } = useAuth();

  const [reportType, setReportType] = useState('global-inventory');
  const [warehouseId, setWarehouseId] = useState('ALL');
  const [productId, setProductId] = useState('ALL');
  const [categoryId, setCategoryId] = useState('ALL');
  const [movementType, setMovementType] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [products, setProducts] = useState<Array<{ _id: string; name: string; sku: string }>>([]);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canExport = hasPermission('REPORTS_EXPORT');

  useEffect(() => {
    Promise.all([
      apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
      apiRequest<{ products: Array<{ _id: string; name: string; sku: string }> }>('/api/products'),
      apiRequest<{ categories: Array<{ _id: string; name: string }> }>('/api/categories'),
    ])
      .then(([w, p, c]) => {
        setWarehouses(w.warehouses);
        setProducts(p.products);
        setCategories(c.categories);
      })
      .catch(() => {});
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
      if (productId !== 'ALL') params.set('productId', productId);
      if (categoryId !== 'ALL') params.set('categoryId', categoryId);
      if (movementType !== 'ALL') params.set('movementType', movementType);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await apiRequest<{
        rows: Array<Record<string, unknown>>;
        summary: Record<string, unknown>;
      }>(`/api/reports/${reportType}?${params.toString()}`);
      setRows(res.rows || []);
      setSummary(res.summary || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [reportType, warehouseId, productId, categoryId, movementType, startDate, endDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== 'categoryId') : [];
  const activeReportTitle = REPORT_TYPES.find((r) => r.id === reportType)?.label || reportType;

  const selectedWarehouseLabel =
    warehouseId === 'ALL'
      ? t.common.allWarehouses
      : warehouses.find((w) => w._id === warehouseId)?.name || warehouseId;
  const selectedCategoryLabel =
    categoryId === 'ALL'
      ? t.common.allCategories
      : categories.find((c) => c._id === categoryId)?.name || categoryId;

  const formatCell = (col: string, val: unknown) => {
    if (val === null || val === undefined) return '-';
    if (col === 'date' && typeof val === 'string') return formatDate(val, brand.dateFormat);
    if (['averageCost', 'totalValue', 'unitCost', 'totalAmount'].includes(col) && typeof val === 'number') {
      return formatCurrency(val, brand.currency);
    }
    return String(val);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      <div className="no-print bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="px-3 py-2 text-xs font-semibold text-[#0B192C] bg-slate-50 border border-slate-300 rounded-md min-w-72"
          >
            {REPORT_TYPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <button
                  type="button"
                  disabled={rows.length === 0}
                  onClick={() => exportToExcel(`khayre_${reportType}`, reportType, rows)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{t.common.exportExcel}</span>
                </button>
                <button
                  type="button"
                  disabled={rows.length === 0}
                  onClick={() =>
                    exportToPdf({
                      filename: `khayre_${reportType}`,
                      title: activeReportTitle,
                      companyName: brand.companyName,
                      columns,
                      rows: rows.map((r) => columns.map((c) => formatCell(c, r[c]))),
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t.common.exportPdf}</span>
                </button>
              </>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={handlePrintReport}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-[#245582] text-white rounded-md hover:bg-[#1B4368] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{language === 'so' ? 'Daabac Warbixinta' : 'Print Report'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allWarehouses}</option>
            {warehouses.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">All Products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
          >
            <option value="ALL">{t.common.allCategories}</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          {reportType === 'product-movement' && (
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="ALL">All Movement Types</option>
              {[
                'Opening Balance',
                'Stock In',
                'Stock Out',
                'Transfer In',
                'Transfer Out',
                'Adjustment In',
                'Adjustment Out',
                'Damaged Stock',
              ].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-md"
          />
        </div>
      </div>

      {/* Document-ready Print Letterhead (shown only when printing) */}
      <div className="print-only border-b-2 border-[#0B192C] pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={brand.companyLogo}
              alt={brand.companyName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded object-cover border border-slate-200"
            />
            <div>
              <h1 className="text-base font-bold text-[#0B192C] tracking-tight">
                {brand.companyName}
              </h1>
              <p className="text-xs font-semibold text-[#245582] mt-0.5">{activeReportTitle}</p>
            </div>
          </div>
          <div className="text-right text-[11px] font-mono text-slate-600 space-y-0.5">
            <p>Generated: {formatDate(new Date(), brand.dateFormat)}</p>
            <p>Prepared By: {user?.fullName || '-'}</p>
          </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
          <span>
            {t.common.warehouse}: <strong className="text-slate-900">{selectedWarehouseLabel}</strong>
          </span>
          <span>
            {t.common.category}: <strong className="text-slate-900">{selectedCategoryLabel}</strong>
          </span>
          {(startDate || endDate) && (
            <span>
              Period:{' '}
              <strong className="font-mono text-slate-900">
                {startDate || '...'} – {endDate || '...'}
              </strong>
            </span>
          )}
        </div>
      </div>

      {Object.keys(summary).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap gap-6 text-xs print:rounded-none print:border-slate-300 print:bg-slate-50">
          {Object.entries(summary).map(([k, v]) => (
            <div key={k}>
              <span className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}: </span>
              <strong className="font-mono tabular-nums text-[#0B192C]">
                {k.toLowerCase().includes('value')
                  ? formatCurrency(Number(v), brand.currency)
                  : String(v)}
              </strong>
            </div>
          ))}
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadReport} />}

      <div className="print-report-sheet bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="no-print px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-[#0B192C]">{brand.companyName}</p>
            <p className="text-xs text-slate-600">{activeReportTitle}</p>
          </div>
          <p className="text-[11px] font-mono text-slate-500">{new Date().toLocaleDateString()}</p>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="print-table-wrapper overflow-x-auto">
            <table className="print-report-table w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="text-left font-semibold px-3 py-2.5 capitalize whitespace-nowrap">
                      {col.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap">
                        {formatCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document-ready Print Sign-off Footer */}
      <div className="print-only pt-8 mt-6 border-t border-slate-300">
        <div className="grid grid-cols-3 gap-8 text-[11px] text-slate-600">
          <div>
            <p className="font-semibold text-slate-800">Prepared By</p>
            <div className="mt-8 border-t border-slate-400 pt-1">{user?.fullName || 'Warehouse Staff'}</div>
          </div>
          <div>
            <p className="font-semibold text-slate-800">Verified By (Warehouse Manager)</p>
            <div className="mt-8 border-t border-slate-400 pt-1">Name & Signature</div>
          </div>
          <div>
            <p className="font-semibold text-slate-800">Approved By (Management)</p>
            <div className="mt-8 border-t border-slate-400 pt-1">Name & Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
}
