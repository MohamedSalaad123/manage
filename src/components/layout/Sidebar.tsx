import {
  LayoutDashboard,
  Warehouse as WarehouseIcon,
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  SlidersHorizontal,
  ClipboardCheck,
  Truck,
  Users,
  BarChart3,
  Bell,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavSection =
  | 'dashboard'
  | 'warehouses'
  | 'products'
  | 'inventory'
  | 'stockIn'
  | 'stockOut'
  | 'transfers'
  | 'adjustments'
  | 'stockCount'
  | 'suppliers'
  | 'employees'
  | 'reports'
  | 'notifications'
  | 'settings';

interface SidebarProps {
  active: NavSection;
  onSelect: (section: NavSection) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ active, onSelect, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t, brand, user, unreadNotifications, hasPermission } = useAuth();

  const items: Array<{
    id: NavSection;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
    badge?: number;
  }> = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard, visible: true },
    { id: 'warehouses', label: t.nav.warehouses, icon: WarehouseIcon, visible: true },
    { id: 'products', label: t.nav.products, icon: Package, visible: hasPermission('PRODUCT_VIEW') },
    { id: 'inventory', label: t.nav.inventory, icon: Boxes, visible: hasPermission('INVENTORY_VIEW') },
    {
      id: 'stockIn',
      label: t.nav.stockIn,
      icon: ArrowDownToLine,
      visible: hasPermission('STOCK_IN_CREATE') || hasPermission('INVENTORY_VIEW'),
    },
    {
      id: 'stockOut',
      label: t.nav.stockOut,
      icon: ArrowUpFromLine,
      visible: hasPermission('STOCK_OUT_CREATE') || hasPermission('INVENTORY_VIEW'),
    },
    {
      id: 'transfers',
      label: t.nav.transfers,
      icon: ArrowLeftRight,
      visible: hasPermission('TRANSFER_CREATE') || hasPermission('INVENTORY_VIEW'),
    },
    {
      id: 'adjustments',
      label: t.nav.adjustments,
      icon: SlidersHorizontal,
      visible: hasPermission('ADJUSTMENT_CREATE') || hasPermission('INVENTORY_VIEW'),
    },
    {
      id: 'stockCount',
      label: t.nav.stockCount,
      icon: ClipboardCheck,
      visible: hasPermission('STOCK_COUNT_CREATE') || hasPermission('INVENTORY_VIEW'),
    },
    { id: 'suppliers', label: t.nav.suppliers, icon: Truck, visible: true },
    {
      id: 'employees',
      label: t.nav.employees,
      icon: Users,
      visible:
        hasPermission('EMPLOYEE_MANAGE') ||
        user?.role === 'SUPER_ADMIN' ||
        user?.role === 'GENERAL_MANAGER',
    },
    { id: 'reports', label: t.nav.reports, icon: BarChart3, visible: hasPermission('REPORTS_VIEW') },
    {
      id: 'notifications',
      label: t.nav.notifications,
      icon: Bell,
      visible: true,
      badge: unreadNotifications,
    },
    {
      id: 'settings',
      label: t.nav.settings,
      icon: Settings,
      visible: hasPermission('SETTINGS_MANAGE') || user?.role === 'SUPER_ADMIN',
    },
  ];

  const navContent = (
    <div className="flex flex-col h-full bg-[#0B192C] text-slate-200 w-64 select-none">
      <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={brand.companyLogo}
            alt={brand.companyName}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-md object-cover bg-white shrink-0 border border-white/15"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-tight text-white truncate">KHAYRE WMS</p>
            <p className="text-[11px] text-slate-400 truncate">
              {user?.assignedWarehouseName || 'All Warehouses'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {items
          .filter((i) => i.visible)
          .map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#245582] text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-amber-300 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      <div className="px-4 py-3 border-t border-white/10 text-[11px] text-slate-400">
        <p className="font-medium text-slate-200 truncate">{user?.fullName}</p>
        <p className="truncate">{user?.role.replace(/_/g, ' ')}</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="no-print hidden lg:block shrink-0 border-r border-slate-200">{navContent}</aside>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/60" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
