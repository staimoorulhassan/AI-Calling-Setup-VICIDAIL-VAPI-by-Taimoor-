import { X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

interface VerifierContext {
  phone: string;
  campaignName?: string;
  callId: string;
  aiSummary?: string;
}

interface Props { context: VerifierContext; onClose: () => void }

export function VerifierContextPanel({ context, onClose }: Props) {
  return (
    <div className="fixed inset-y-0 right-0 w-80 shadow-xl z-40 flex flex-col bg-white border-l border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <p className="font-medium text-sm">Transfer Context</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Row label="Prospect" value={context.phone} />
        {context.campaignName && <Row label="Campaign" value={context.campaignName} />}
        <Row label="Call ID" value={<span className="font-mono text-xs">{context.callId}</span>} />
        {context.aiSummary && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">AI Summary</p>
            <p className="text-sm text-gray-800 bg-gray-50 rounded p-2">{context.aiSummary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
