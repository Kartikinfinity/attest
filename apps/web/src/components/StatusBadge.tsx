import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Circle } from 'lucide-react';
import type { DisplayStatus } from '../lib/status';
import { toneClasses } from '../lib/status';

const ICONS = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Circle,
  neutral: HelpCircle,
} as const;

export function StatusBadge({ status, size = 'md' }: { status: DisplayStatus; size?: 'sm' | 'md' }) {
  const c = toneClasses(status.tone);
  const Icon = ICONS[status.tone];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-2.5 py-1 text-xs gap-1.5';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold ring-1 ring-inset ${c.bg} ${c.text} ${c.ring} ${sizeClasses}`}
    >
      {status.pulsing ? (
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`} />
        </span>
      ) : (
        <Icon className={`${iconSize} flex-shrink-0`} />
      )}
      {status.label}
    </span>
  );
}
