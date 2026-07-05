import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ShortcutHelp } from './components/layout/ShortcutHelp';
import { GlobalQuickSearch } from './components/layout/GlobalQuickSearch';
import { ToastHost } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const BoardsPage = lazy(() => import('./pages/BoardsPage').then((module) => ({ default: module.BoardsPage })));
const BoardDetailPage = lazy(() => import('./pages/BoardDetailPage').then((module) => ({ default: module.BoardDetailPage })));
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((module) => ({ default: module.GoalsPage })));
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage').then((module) => ({ default: module.GoalDetailPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((module) => ({ default: module.CalendarPage })));
const PomodoroPage = lazy(() => import('./pages/PomodoroPage').then((module) => ({ default: module.PomodoroPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));

function PageFallback() {
  return (
    <div className="h-full flex items-center justify-center text-sm text-text-muted">
      <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

export function AppRouter() {
  return (
    <div className="h-full w-full flex" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/boards" element={<BoardsPage />} />
                <Route path="/boards/:id" element={<BoardDetailPage />} />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/goals/:id" element={<GoalDetailPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/pomodoro" element={<PomodoroPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <GlobalQuickSearch />
      <ShortcutHelp />
      <ToastHost />
    </div>
  );
}
