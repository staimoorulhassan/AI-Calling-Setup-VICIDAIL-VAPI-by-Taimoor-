import { cn } from '@/lib/utils';

interface Props { status: 'ok' | 'degraded' | 'down' | string; label?: string }

const colors: Record<string, string> = {
  ok: 'bg-green-500', healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500', unhealthy: 'bg-red-500',
};

export function StatusIndicator({ status, label }: Props) {
  const color = colors[status] ?? 'bg-gray-400';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </span>
  );
}
