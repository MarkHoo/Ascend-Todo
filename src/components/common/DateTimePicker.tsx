import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { DayPicker } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import 'react-day-picker/dist/style.css';
import { Calendar as CalIcon, X } from 'lucide-react';
import { dayjs } from '@/utils/date';
import clsx from 'clsx';

/** Global singleton: only one DateTimePicker open at a time */
let _openId: string | null = null;
const _listeners = new Set<() => void>();

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

function useGlobalOpen(id: string, isOpen: boolean, setOpen: (v: boolean) => void) {
  useEffect(() => {
    const listener = () => {
      if (_openId !== id && isOpen) {
        setOpen(false);
      }
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, [id, isOpen, setOpen]);

  useEffect(() => {
    if (isOpen) {
      _openId = id;
      notifyListeners();
    } else if (_openId === id) {
      _openId = null;
    }
  }, [isOpen, id]);
}

interface Props {
  value?: string | null;
  onChange: (v: string | null) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
  /** Unique id for global singleton — defaults to placeholder */
  pickerId?: string;
}

export function DateTimePicker({ value, onChange, withTime, placeholder, className, pickerId }: Props) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const id = pickerId || placeholder || Math.random().toString(36).slice(2);

  useGlobalOpen(id, open, setOpen);

  const date = value ? dayjs(value) : null;
  const selected = date ? date.toDate() : undefined;
  const lang = i18n.language;

  const weekdayLabels = lang === 'zh-CN' || lang === 'zh-TW'
    ? ['一', '二', '三', '四', '五', '六', '日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const formatCaption = (month: Date) => {
    const d = dayjs(month);
    if (lang === 'zh-CN' || lang === 'zh-TW') {
      return d.format('YYYY年M月');
    }
    return d.format('MMMM YYYY');
  };

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popupWidth = 326;
      const left = Math.min(window.innerWidth - popupWidth - 12, Math.max(12, rect.right - popupWidth));
      const top = Math.min(window.innerHeight - 390, rect.bottom + 6);
      setPopupStyle({
        position: 'fixed',
        left,
        top: Math.max(12, top),
        width: popupWidth,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div className={clsx('relative block w-full', className)}>
      <button
        ref={buttonRef}
        type="button"
        className="input flex w-full items-center gap-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <CalIcon size={16} />
        <span className="flex-1 truncate">
          {date ? (withTime ? date.format('YYYY-MM-DD HH:mm') : date.format('YYYY-MM-DD')) : placeholder || '-'}
        </span>
        {value && (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="text-text-muted hover:text-text"
          >
            <X size={14} />
          </span>
        )}
      </button>
      {open && (
        <div
          className="z-[80] card p-2"
          style={{ ...popupStyle, boxShadow: '0 8px 24px var(--shadow)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (!d) {
                onChange(null);
                setOpen(false);
                return;
              }
              let dt = dayjs(d);
              if (withTime && date) {
                dt = dt.hour(date.hour()).minute(date.minute());
              } else if (withTime) {
                dt = dt.hour(9).minute(0);
              }
              onChange(dt.toISOString());
              setOpen(false);
            }}
            formatters={{
              formatCaption,
              formatWeekdayName: (weekday: Date) => {
                const dow = dayjs(weekday).isoWeekday();
                return weekdayLabels[dow - 1] || '';
              },
            }}
          />
          {withTime && (
            <div className="flex items-center gap-2 px-2 pt-2 border-t border-border">
              <span className="text-xs text-text-muted">
                {lang === 'zh-CN' ? '时间' : lang === 'zh-TW' ? '時間' : 'Time'}
              </span>
              <input
                type="time"
                className="input py-1 px-2 text-xs w-auto"
                value={date ? date.format('HH:mm') : '09:00'}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(':').map(Number);
                  const base = date || dayjs();
                  onChange(base.hour(h).minute(m).toISOString());
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TimeProps {
  value?: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}

export function TimePicker({ value, onChange, className }: TimeProps) {
  return (
    <input
      type="time"
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={clsx('input w-auto', className)}
    />
  );
}
