import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { AdminLayout } from '@/layouts/AdminLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UsersPage } from '@/pages/UsersPage';
import { UserDetailPage } from '@/pages/UserDetailPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { SyncLogsPage } from '@/pages/SyncLogsPage';
import { SystemHealthPage } from '@/pages/SystemHealthPage';

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Protected><AdminLayout /></Protected>}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="sync-logs" element={<SyncLogsPage />} />
          <Route path="system-health" element={<SystemHealthPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

