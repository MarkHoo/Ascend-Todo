import clsx from 'clsx';

interface Props {
  value: number; // 0..1
  height?: number;
  className?: string;
  color?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, height = 8, className, color, showLabel }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={clsx('w-full', className)}>
      <div
        className="rounded-full overflow-hidden"
        style={{ height, background: 'var(--surface-2)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: color || 'var(--primary)',
          }}
        />
      </div>
      {showLabel && (
        <div className="text-xs text-text-muted mt-1">{Math.round(pct)}%</div>
      )}
    </div>
  );
}
