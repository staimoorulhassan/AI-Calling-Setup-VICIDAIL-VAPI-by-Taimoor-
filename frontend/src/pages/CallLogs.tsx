import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { useCalls } from '@/hooks/useCalls';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { formatDateTime, formatDuration } from '@/lib/utils';
import api from '@/api/client';

const PAGE_SIZE = 25;

export function CallLogs() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [disposition, setDisposition] = useState('');

  const { data, isLoading } = useCalls({ page, pageSize: PAGE_SIZE, status: status || undefined, disposition: disposition || undefined });

  function exportCsv() {
    const params = new URLSearchParams({ status, disposition }).toString();
    window.open(`/api/calls/export?${params}`, '_blank');
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Call Logs</h1>
        <Button variant="secondary" onClick={exportCsv} className="flex items-center gap-2">
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-3">
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="">All statuses</option>
              {['initiated','ringing','connected','transferring','ended','failed'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={disposition}
              onChange={e => { setDisposition(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="">All dispositions</option>
              {['answered','voicemail','ivr','transferred','transfer_failed','no_answer','failed','test'].map(d => (
                <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Disposition</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.data.map(call => (
                  <tr key={call.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">{call.phone}</td>
                    <td className="px-4 py-3"><Badge label={call.status} /></td>
                    <td className="px-4 py-3">{call.disposition ? <Badge label={call.disposition} /> : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{call.durationSec != null ? formatDuration(call.durationSec) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(call.startedAt)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/calls/${call.id}`} className="text-blue-600 hover:underline text-xs">Detail</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{data.total} total calls</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
            <span className="px-2 py-1">Page {page}</span>
            <Button variant="ghost" onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= data.total}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
