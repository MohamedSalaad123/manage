import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Sidebar, type NavSection } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { StockInPage } from './pages/StockInPage';
import { StockOutPage } from './pages/StockOutPage';
import { TransfersPage } from './pages/TransfersPage';
import { AdjustmentsPage } from './pages/AdjustmentsPage';
import { StockCountPage } from './pages/StockCountPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SettingsPage } from './pages/SettingsPage';

function WmsShell() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!user) {
    return <AuthPage />;
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardPage />;
      case 'warehouses':
        return <WarehousesPage />;
      case 'products':
        return <ProductsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'stockIn':
        return <StockInPage />;
      case 'stockOut':
        return <StockOutPage />;
      case 'transfers':
        return <TransfersPage />;
      case 'adjustments':
        return <AdjustmentsPage />;
      case 'stockCount':
        return <StockCountPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'employees':
        return <EmployeesPage />;
      case 'reports':
        return <ReportsPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 print:block print:bg-white">
      <Sidebar
        active={activeSection}
        onSelect={setActiveSection}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 print:block">
        <TopBar
          activeSection={activeSection}
          onNavigate={setActiveSection}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto print:p-0 print:max-w-none print:m-0">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <WmsShell />
      </AuthProvider>
    </ToastProvider>
  );
}
