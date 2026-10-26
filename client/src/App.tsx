import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import AdminApp from './pages/admin/AdminApp';
import WaiterTables from './pages/waiter/Tables';
import WaiterOrder from './pages/waiter/Order';
import BillerOverview from './pages/biller/Overview';
import BillerBill from './pages/biller/Bill';
import Kitchen from './pages/kitchen/Kitchen';
import PublicMenu from './pages/public/PublicMenu';
import Landing from './pages/public/Landing';
import SiteFlourish from './components/SiteFlourish';
import ScrollRestoration from './components/ScrollRestoration';
import ScrollReveal from './components/ScrollReveal';
import NotFound from './pages/NotFound';

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'RestoPOS | Live Restaurant Management',
      '/login': 'Sign in | RestoPOS',
      '/public': 'Restaurant Menu | RestoPOS',
      '/admin': 'Admin Dashboard | RestoPOS',
      '/waiter': 'Tables | RestoPOS',
      '/biller': 'Billing Overview | RestoPOS',
      '/kitchen': 'Kitchen Display | RestoPOS',
    };
    const title = titles[pathname]
      ?? (pathname.startsWith('/admin/') ? 'Administration | RestoPOS'
        : pathname.startsWith('/waiter/order/') ? 'Order | RestoPOS'
          : pathname.startsWith('/biller/bill/') ? 'Bill | RestoPOS'
            : 'Page Not Found | RestoPOS');
    document.title = title;
  }, [pathname]);

  return null;
}

function Protected({ roles, children }: { roles?: string[]; children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <div className="p-8">Forbidden</div>;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PageTitle />
        <ScrollRestoration />
        <ScrollReveal />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/public" element={<PublicMenu />} />

          <Route path="/admin" element={<Protected roles={['ADMIN']}><AdminApp /></Protected>} />

          <Route path="/waiter" element={<Protected roles={['WAITER','ADMIN']}><WaiterTables /></Protected>} />
          <Route path="/waiter/order/:sessionId" element={<Protected roles={['WAITER','ADMIN']}><WaiterOrder /></Protected>} />

          <Route path="/biller" element={<Protected roles={['BILLER','ADMIN']}><BillerOverview /></Protected>} />
          <Route path="/biller/bill/:billId" element={<Protected roles={['BILLER','ADMIN']}><BillerBill /></Protected>} />

          <Route path="/kitchen" element={<Protected roles={['KITCHEN','ADMIN','WAITER']}><Kitchen /></Protected>} />

          <Route path="/" element={<Landing />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <SiteFlourish />
      </BrowserRouter>
    </AuthProvider>
  );
}
