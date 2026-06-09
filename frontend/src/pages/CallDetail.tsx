import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCall, useCallTranscript, useCallEvents } from '@/hooks/useCalls';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TranscriptPane } from '@/components/TranscriptPane';
import { Spinner } from '@/components/ui/Spinner';
import { formatDateTime, formatDuration } from '@/lib/utils';

export function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: call, isLoading } = useCall(id!);
  const { data: transcript = [] } = useCallTranscript(id!);
  const { data: events = [] } = useCallEvents(id!);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!call) return <p className="p-6 text-red-600">Call not found</p>;

  return (
    <div className="p-6 max-w-4xl">
      <Link to="/calls" className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-5">
        <ArrowLeft size={14} /> Back to logs
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <Card>
          <CardHeader><p className="text-sm font-medium">Call Info</p></CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Phone" value={call.phone} />
            <Row label="Status" value={<Badge label={call.status} />} />
            <Row label="Disposition" value={call.disposition ? <Badge label={call.disposition} /> : '—'} />
            <Row label="Duration" value={call.durationSec != null ? formatDuration(call.durationSec) : '—'} />
            <Row label="Started" value={formatDateTime(call.startedAt)} />
            {call.endedAt && <Row label="Ended" value={formatDateTime(call.endedAt)} />}
            {call.isTest && <Row label="Test call" value="Yes" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><p className="text-sm font-medium">Events</p></CardHeader>
          <CardBody className="max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-gray-400">No events</p>
            ) : (
              <ol className="space-y-1.5">
                {events.map(ev => (
                  <li key={ev.id} className="text-xs text-gray-600">
                    <span className="text-gray-400">{formatDateTime(ev.createdAt)}</span>
                    {' · '}
                    <span className="font-medium">{ev.eventType}</span>
                    {' · '}
                    <span className="text-gray-400">{ev.source}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><p className="text-sm font-medium">Transcript</p></CardHeader>
        <CardBody>
          <TranscriptPane turns={transcript.map(t => ({ role: t.role, content: t.content, timestamp: t.timestamp }))} />
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
