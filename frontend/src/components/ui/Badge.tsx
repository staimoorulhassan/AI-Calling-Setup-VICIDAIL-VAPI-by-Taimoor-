import { cn } from '@/lib/utils';

const dispositionColors: Record<string, string> = {
  answered:       'bg-green-100 text-green-800',
  voicemail:      'bg-yellow-100 text-yellow-800',
  ivr:            'bg-orange-100 text-orange-800',
  transferred:    'bg-blue-100 text-blue-800',
  transfer_failed:'bg-red-100 text-red-800',
  failed:         'bg-red-100 text-red-800',
  no_answer:      'bg-gray-100 text-gray-700',
  test:           'bg-purple-100 text-purple-800',
  connected:      'bg-green-100 text-green-800',
  ringing:        'bg-yellow-100 text-yellow-800',
  initiated:      'bg-gray-100 text-gray-600',
  transferring:   'bg-blue-100 text-blue-800',
  on_hold:        'bg-indigo-100 text-indigo-800',
  ended:          'bg-gray-100 text-gray-600',
  active:         'bg-green-100 text-green-800',
  paused:         'bg-yellow-100 text-yellow-800',
  disabled:       'bg-gray-100 text-gray-500',
};

interface BadgeProps { label: string; className?: string }

export function Badge({ label, className }: BadgeProps) {
  const color = dispositionColors[label] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color, className)}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}
