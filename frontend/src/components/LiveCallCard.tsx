import { useState } from 'react';
import { PhoneForwarded, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/Toast';
import { formatDuration } from '@/lib/utils';
import type { Call } from '@/hooks/useCalls';

interface Props { call: Call; onSelectTranscript?: (callId: string) => void }

export function LiveCallCard({ call, onSelectTranscript }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [overridePhone, setOverridePhone] = useState('');

  const { mutate: transfer, isPending } = useMutation({
    mutationFn: () =>
      api.post(`/calls/${call.id}/transfer`, overridePhone ? { transferPhone: overridePhone } : {}).then(r => r.data),
    onSuccess: () => {
      toast('Transfer initiated', 'success');
      qc.invalidateQueries({ queryKey: ['calls'] });
    },
    onError: () => toast('Transfer failed', 'error'),
  });

  const elapsed = call.startedAt
    ? formatDuration(Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000))
    : '—';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900 text-sm">{call.phone}</p>
          <p className="text-xs text-gray-500 mt-0.5">{elapsed}</p>
        </div>
        <Badge label={call.status} />
      </div>
      <div className="flex gap-2">
        <input
          type="tel"
          placeholder="Override transfer #"
          value={overridePhone}
          onChange={e => setOverridePhone(e.target.value)}
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button
          variant="secondary"
          onClick={() => transfer()}
          disabled={isPending}
          className="text-xs px-2 py-1"
        >
          <PhoneForwarded size={13} />
        </Button>
        {onSelectTranscript && (
          <Button
            variant="ghost"
            onClick={() => onSelectTranscript(call.id)}
            className="text-xs px-2 py-1"
          >
            Transcript
          </Button>
        )}
      </div>
    </div>
  );
}
