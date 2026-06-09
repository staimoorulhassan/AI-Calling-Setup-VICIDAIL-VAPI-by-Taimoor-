import { useState } from 'react';
import { useCallsBoard } from '@/hooks/useCallsBoard';
import { useTranscript } from '@/hooks/useTranscript';
import { LiveCallCard } from '@/components/LiveCallCard';
import { TranscriptPane } from '@/components/TranscriptPane';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ToastProvider } from '@/components/Toast';

export function Dashboard() {
  const calls = useCallsBoard();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const transcriptTurns = useTranscript(selectedCallId);

  return (
    <ToastProvider>
      <div className="p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-5">Live Call Board</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {calls.length === 0 ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-gray-500 text-center py-8">No active calls</p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {calls.map(call => (
                  <LiveCallCard
                    key={call.id}
                    call={call}
                    onSelectTranscript={setSelectedCallId}
                  />
                ))}
              </div>
            )}
          </div>
          {selectedCallId && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Live Transcript</p>
                  <button
                    onClick={() => setSelectedCallId(null)}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Close
                  </button>
                </div>
              </CardHeader>
              <CardBody>
                <TranscriptPane turns={transcriptTurns} isLive />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </ToastProvider>
  );
}
