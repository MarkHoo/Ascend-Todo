import type { ChangeEventHandler } from 'react';
import { CalendarDays } from 'lucide-react';
import clsx from 'clsx';

interface NativeDateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

function displayDateTime(value: string) {
  if (!value) return '';
  const [date, time = ''] = value.split('T');
  return `${date} ${time.slice(0, 5)}`.trim();
}

export function NativeDateTimeInput({
  value,
  onChange,
  label,
  placeholder = 'YYYY-MM-DD HH:mm',
  className,
}: NativeDateTimeInputProps) {
  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    onChange(event.target.value);
  };

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <div className="input relative flex min-w-0 items-center">
        <span className={clsx('min-w-0 flex-1 truncate', !value && 'text-text-muted')}>
          {displayDateTime(value) || placeholder}
        </span>
        <CalendarDays size={16} className="shrink-0 text-text-muted" />
        <input
          type="datetime-local"
          value={value}
          onChange={handleChange}
          onClick={(event) => {
            event.currentTarget.showPicker();
          }}
          aria-label={label || placeholder}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
