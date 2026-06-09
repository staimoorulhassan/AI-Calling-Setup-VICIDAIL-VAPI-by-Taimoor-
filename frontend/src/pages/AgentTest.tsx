import { useState, FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '@/api/client';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useTranscript } from '@/hooks/useTranscript';
import { TranscriptPane } from '@/components/TranscriptPane';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/Toast';
import { ToastProvider } from '@/components/Toast';

interface TestCallResult { callId: string; vapiCallId: string; status: string }

function AgentTestInner() {
  const { toast } = useToast();
  const { data: campaigns = [] } = useCampaigns();
  const [campaignId, setCampaignId] = useState('');
  const [phone, setPhone] = useState('');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const transcript = useTranscript(activeCallId);

  const { mutate: testCall, isPending } = useMutation({
    mutationFn: () =>
      api.post<TestCallResult>('/calls/test', { campaignId: campaignId || undefined, phone }).then(r => r.data),
    onSuccess: result => {
      setActiveCallId(result.callId);
      toast('Test call initiated — listening for transcript', 'success');
    },
    onError: () => toast('Test call failed', 'error'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setActiveCallId(null);
    testCall();
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Agent Test</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader><p className="text-sm font-medium">Start Test Call</p></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign (optional)</label>
                <select
                  value={campaignId}
                  onChange={e => setCampaignId(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm"
                >
                  <option value="">— none —</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <input
                  type="tel" required
                  value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button type="submit" variant="primary" disabled={isPending} className="w-full">
                {isPending ? <Spinner className="text-white" /> : 'Call'}
              </Button>
            </form>
            {activeCallId && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">Active call ID: <span className="font-mono">{activeCallId}</span></p>
                <Badge label="test" className="mt-1" />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-sm font-medium">Live Transcript</p>
          </CardHeader>
          <CardBody>
            <TranscriptPane turns={transcript} isLive />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function AgentTest() {
  return (
    <ToastProvider>
      <AgentTestInner />
    </ToastProvider>
  );
}
