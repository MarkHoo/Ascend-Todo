import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Trello,
  Target,
  CalendarDays,
  Timer,
  Pin,
  PinOff,
  Settings,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useBoardStore } from '@/store/useBoardStore';
import { useProfileStore } from '@/store/useProfileStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { setDayjsLocale } from '@/utils/date';

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { boards, fetchBoards, togglePin } = useBoardStore();
  const { profile, fetchProfile } = useProfileStore();
  const { settings } = useSettingsStore();
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchBoards();
      fetchProfile();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [fetchBoards, fetchProfile]);

  useEffect(() => {
    setDayjsLocale(settings.language);
    i18n.changeLanguage(settings.language);
  }, [settings.language, i18n]);

  const navItems = [
    { to: '/overview', label: t('nav.overview'), icon: LayoutDashboard },
    { to: '/boards', label: t('nav.boards'), icon: Trello },
    { to: '/goals', label: t('nav.goals'), icon: Target },
    { to: '/calendar', label: t('nav.calendar'), icon: CalendarDays },
    { to: '/pomodoro', label: t('nav.pomodoro'), icon: Timer },
  ];

  const pinned = boards.filter((b) => b.isPinned);

  return (
    <aside
      className="w-60 shrink-0 h-full border-r border-border flex flex-col"
      style={{ background: 'var(--surface)' }}
    >
      <div className="px-4 py-4">
        <div className="text-lg font-bold tracking-tight">{t('app.name')}</div>
        <div className="text-[11px] text-text-muted">{t('app.slogan')}</div>
      </div>
      <nav className="px-2 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'font-semibold text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-2',
              )
            }
            style={({ isActive }) =>
              isActive ? { background: 'var(--primary-soft)', color: 'var(--primary)' } : {}
            }
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {pinned.length > 0 && (
        <>
          <div className="mt-4 px-4 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            {t('board.pinned')}
          </div>
          <div className="px-2 mt-1 flex flex-col gap-0.5">
            {pinned.map((b) => (
              <div
                key={b.id}
                className="group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-sm hover:bg-surface-2"
                onMouseEnter={() => setHovered(b.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => navigate(`/boards/${b.id}`)}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: b.color || 'var(--primary)' }}
                />
                <span className="truncate flex-1">{b.name}</span>
                {hovered === b.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(b.id);
                    }}
                    className="text-text-muted hover:text-text p-0.5"
                  >
                    <PinOff size={12} />
                  </button>
                )}
                {!hovered && <Pin size={12} className="text-text-muted" />}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex-1" />

      <div className="p-3 border-t border-border flex flex-col gap-1">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text hover:bg-surface-2"
        >
          <Settings size={16} />
          {t('nav.settings')}
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-surface-2"
        >
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt="avatar"
              className="w-7 h-7 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs">
              {(profile?.nickname || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm truncate">{profile?.nickname || t('profile.nickname')}</div>
            <div className="text-[11px] text-text-muted truncate">
              {profile?.signature || t('nav.profile')}
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
}
