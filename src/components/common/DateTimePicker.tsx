import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { Calendar as CalIcon, X } from 'lucide-react';
import { dayjs } from '@/utils/date';
import clsx from 'clsx';

interface Props {
  value?: string | null;
  onChange: (v: string | null) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({ value, onChange, withTime, placeholder, className }: Props) {
  const [open, setOpen] = useState(false);
  const date = value ? dayjs(value) : null;
  const selected = date ? date.toDate() : undefined;

  return (
    <div className={clsx('relative inline-block', className)}>
      <button
        type="button"
        className="input flex items-center gap-2 text-left"
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
          className="absolute z-50 mt-1 card p-2"
          style={{ boxShadow: '0 8px 24px var(--shadow)' }}
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
          />
          {withTime && (
            <div className="flex items-center gap-2 px-2 pt-2 border-t border-border">
              <span className="text-xs text-text-muted">Time</span>
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
  value?: string | null; // HH:MM
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
