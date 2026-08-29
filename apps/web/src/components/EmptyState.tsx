import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-12 text-center flex flex-col items-center justify-center min-h-[280px]">
      <div className="bg-neutral-100 p-3 rounded-full mb-4">
        <Icon className="h-6 w-6 text-neutral-400" aria-hidden="true" />
      </div>
      <h4 className="text-neutral-900 font-semibold mb-1.5">{title}</h4>
      <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
