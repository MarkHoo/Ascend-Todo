import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ToastHost } from './components/common/Toast';
import { OverviewPage } from './pages/OverviewPage';
import { BoardsPage } from './pages/BoardsPage';
import { BoardDetailPage } from './pages/BoardDetailPage';
import { GoalsPage } from './pages/GoalsPage';
import { CalendarPage } from './pages/CalendarPage';
import { PomodoroPage } from './pages/PomodoroPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

export function AppRouter() {
  return (
    <div className="h-full w-full flex" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route path="/boards/:id" element={<BoardDetailPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/pomodoro" element={<PomodoroPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}
