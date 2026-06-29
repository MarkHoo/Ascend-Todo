import { PRESET_COLORS } from '@/utils/format';
import { Check } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  value?: string | null;
  onChange: (v: string | null) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={clsx(
          'w-7 h-7 rounded-md border border-border flex items-center justify-center',
          !value && 'ring-2 ring-primary',
        )}
        title="No color"
      >
        <span className="w-3 h-3 rounded-sm bg-surface-2" />
      </button>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={clsx(
            'w-7 h-7 rounded-md flex items-center justify-center text-white',
            value === c && 'ring-2 ring-offset-2 ring-primary',
          )}
          style={{ background: c }}
          title={c}
        >
          {value === c && <Check size={14} />}
        </button>
      ))}
    </div>
  );
}
