import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency, formatDate, formatNumber } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { ErrorBanner, TableSkeleton } from '../components/ui/DataState';
import { StatusLabel } from '../components/ui/StatusLabel';

interface DashboardData {
  kpis: {
    totalWarehouses: number;
    activeWarehouses: number;
    totalProducts: number;
    totalStockQuantity: number;
    totalInventoryValue: number;
    totalStockInToday: number;
    totalStockOutToday: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    pendingTransfers: number;
    totalEmployees: number;
  };
  charts: {
    stockInVsOut: Array<{ period: string; stockIn: number; stockOut: number }>;
    warehouseDistribution: Array<{ name: string; code: string; quantity: number; valuation: number }>;
    top10Products: Array<{ name: string; fullName: string; sku: string; quantity: number; value: number }>;
    monthlyMovement: Array<{ period: string; stockIn: number; stockOut: number; netMovement: number }>;
    warehouseValuation: Array<{ name: string; code: string; quantity: number; valuation: number }>;
  };
  recentMovements: Array<{
    _id: string;
    transactionNumber: string;
    movementType: string;
    quantityIn: number;
    quantityOut: number;
    newQuantity: number;
    transactionDate: string;
    warehouseId?: { name: string; code: string };
    productId?: { name: string; sku: string; unit: string };
    performedBy?: { fullName: string };
  }>;
}

interface WarehouseOption {
  _id: string;
  name: string;
  code: string;
}

const CHART_COLORS = ['#0B192C', '#245582', '#3B7BB5', '#64748B', '#0F766E', '#B45309'];

export function DashboardPage() {
  const { t, brand, language, user } = useAuth();
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSelectAll =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'GENERAL_MANAGER' ||
    user?.role === 'ACCOUNTANT' ||
    user?.permissions.includes('WAREHOUSE_VIEW_ALL');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedWarehouse !== 'ALL') params.set('warehouseId', selectedWarehouse);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const [dashRes, whRes] = await Promise.all([
        apiRequest<DashboardData>(`/api/dashboard?${params.toString()}`),
        apiRequest<{ warehouses: WarehouseOption[] }>('/api/warehouses'),
      ]);
      setData(dashRes);
      setWarehouses(whRes.warehouses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse, startDate, endDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const kpiCards = data
    ? [
        { label: t.dashboard.totalWarehouses, value: formatNumber(data.kpis.totalWarehouses) },
        { label: t.dashboard.activeWarehouses, value: formatNumber(data.kpis.activeWarehouses) },
        { label: t.dashboard.totalProducts, value: formatNumber(data.kpis.totalProducts) },
        { label: t.dashboard.totalStockQuantity, value: formatNumber(data.kpis.totalStockQuantity) },
        {
          label: t.dashboard.totalInventoryValue,
          value: formatCurrency(data.kpis.totalInventoryValue, brand.currency),
          emphasis: true,
        },
        { label: t.dashboard.stockInToday, value: formatNumber(data.kpis.totalStockInToday) },
        { label: t.dashboard.stockOutToday, value: formatNumber(data.kpis.totalStockOutToday) },
        {
          label: t.dashboard.lowStockProducts,
          value: formatNumber(data.kpis.lowStockProducts),
          alert: data.kpis.lowStockProducts > 0 ? 'warn' : undefined,
        },
        {
          label: t.dashboard.outOfStockProducts,
          value: formatNumber(data.kpis.outOfStockProducts),
          alert: data.kpis.outOfStockProducts > 0 ? 'danger' : undefined,
        },
        { label: t.dashboard.pendingTransfers, value: formatNumber(data.kpis.pendingTransfers) },
        { label: t.dashboard.totalEmployees, value: formatNumber(data.kpis.totalEmployees) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#0B192C]">{t.dashboard.title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'so'
              ? 'Xogta tooska ah ee kaydka, qiimeynta, iyo dhaqdhaqaaqa bakhaarrada'
              : 'Live database metrics across warehouse inventory, valuation, and stock movements'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canSelectAll && (
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#245582]"
            >
              <option value="ALL">{t.common.allWarehouses}</option>
              {warehouses.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label={t.common.from}
              className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-none focus:border-[#245582]"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label={t.common.to}
              className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-none focus:border-[#245582]"
            />
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{language === 'so' ? 'Cusbooneysii' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={loadDashboard} />}

      {loading && !data ? (
        <div className="bg-white border border-slate-200 rounded-lg">
          <TableSkeleton rows={8} />
        </div>
      ) : (
        data && (
          <>
            {/* 11 Real-Time KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {kpiCards.map((kpi) => (
                <div
                  key={kpi.label}
                  className={`bg-white border rounded-lg p-4 ${
                    kpi.emphasis ? 'border-[#245582]/40 bg-[#F3F7FB]' : 'border-slate-200'
                  }`}
                >
                  <p className="text-[11px] font-medium text-slate-500 leading-snug">{kpi.label}</p>
                  <p
                    className={`mt-2 text-lg font-bold font-mono tabular-nums ${
                      kpi.alert === 'danger'
                        ? 'text-red-700'
                        : kpi.alert === 'warn'
                        ? 'text-amber-700'
                        : kpi.emphasis
                        ? 'text-[#0B192C]'
                        : 'text-slate-900'
                    }`}
                  >
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Row 1 Charts: Stock In vs Stock Out & Inventory Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0B192C] mb-4">
                  {t.dashboard.chartInOut}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.stockInVsOut}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="stockIn" name="Stock In" fill="#245582" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="stockOut" name="Stock Out" fill="#0B192C" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0B192C] mb-4">
                  {t.dashboard.chartDistribution}
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.charts.warehouseDistribution}
                        dataKey="quantity"
                        nameKey="name"
                        cx="50%"
                        cy="46%"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {data.charts.warehouseDistribution.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row 2 Charts: Top 10 Products & Monthly Stock Movement */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0B192C] mb-4">
                  {t.dashboard.chartTop10}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.top10Products} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={130}
                        tick={{ fontSize: 11, fill: '#334155' }}
                      />
                      <Tooltip />
                      <Bar dataKey="quantity" name="Quantity" fill="#245582" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0B192C] mb-4">
                  {t.dashboard.chartMonthly}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.charts.monthlyMovement}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#475569' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        type="monotone"
                        dataKey="stockIn"
                        name="Inbound"
                        stroke="#245582"
                        fill="#245582"
                        fillOpacity={0.18}
                      />
                      <Area
                        type="monotone"
                        dataKey="stockOut"
                        name="Outbound"
                        stroke="#0B192C"
                        fill="#0B192C"
                        fillOpacity={0.12}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 5: Warehouse Inventory Valuation */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-[#0B192C] mb-4">
                {t.dashboard.chartValuation}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.charts.warehouseValuation}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                    <Tooltip formatter={(val) => formatCurrency(Number(val || 0), brand.currency)} />
                    <Bar dataKey="valuation" name="Valuation (USD)" fill="#0B192C" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Stock Ledger Activity */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-[#0B192C]">
                  {t.dashboard.recentMovements}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2.5">{t.common.date}</th>
                      <th className="text-left font-semibold px-4 py-2.5">{t.common.reference}</th>
                      <th className="text-left font-semibold px-4 py-2.5">{t.common.warehouse}</th>
                      <th className="text-left font-semibold px-4 py-2.5">{t.common.product}</th>
                      <th className="text-left font-semibold px-4 py-2.5">Type</th>
                      <th className="text-right font-semibold px-4 py-2.5">In</th>
                      <th className="text-right font-semibold px-4 py-2.5">Out</th>
                      <th className="text-right font-semibold px-4 py-2.5">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentMovements.map((m) => (
                      <tr key={m._id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatDate(m.transactionDate, brand.dateFormat)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                          {m.transactionNumber}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{m.warehouseId?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-slate-900 font-medium">
                          {m.productId?.name || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusLabel status={m.movementType} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                          {m.quantityIn > 0 ? `+${formatNumber(m.quantityIn)}` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">
                          {m.quantityOut > 0 ? `-${formatNumber(m.quantityOut)}` : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatNumber(m.newQuantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
