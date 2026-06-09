import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { TranscriptTurn } from '@/hooks/useTranscript';

interface Props { turns: TranscriptTurn[]; isLive?: boolean }

export function TranscriptPane({ turns, isLive }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLive) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, isLive]);

  if (!turns.length) {
    return <p className="text-sm text-gray-400 italic">No transcript yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto max-h-96 pr-1">
      {turns.map((t, i) => (
        <div
          key={i}
          className={cn(
            'rounded-lg px-3 py-2 text-sm max-w-[80%]',
            t.role === 'assistant'
              ? 'bg-blue-50 text-blue-900 self-start'
              : 'bg-gray-100 text-gray-800 self-end',
          )}
        >
          <p className="text-xs font-medium mb-0.5 opacity-60 capitalize">{t.role}</p>
          <p>{t.content}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
