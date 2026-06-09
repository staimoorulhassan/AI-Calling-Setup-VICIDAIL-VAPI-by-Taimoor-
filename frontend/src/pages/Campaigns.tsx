import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useCampaigns, useDeleteCampaign, useSetCampaignStatus } from '@/hooks/useCampaigns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Card, CardBody } from '@/components/ui/Card';
import { ToastProvider, useToast } from '@/components/Toast';

function CampaignsInner() {
  const { toast } = useToast();
  const { data: campaigns = [], isLoading } = useCampaigns();
  const { mutate: deleteCampaign } = useDeleteCampaign();
  const { mutate: setStatus } = useSetCampaignStatus();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete campaign "${name}"?`)) return;
    deleteCampaign(id, {
      onSuccess: () => toast('Campaign deleted', 'success'),
      onError: () => toast('Delete failed', 'error'),
    });
  }

  function toggleStatus(id: string, current: string) {
    const next = current === 'active' ? 'paused' : 'active';
    setStatus({ id, status: next }, {
      onError: () => toast('Status update failed', 'error'),
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Campaigns</h1>
        <Link to="/campaigns/new">
          <Button variant="primary" className="flex items-center gap-2">
            <Plus size={14} /> New Campaign
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500 text-center py-8">No campaigns yet. Create one to get started.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => (
            <Card key={c.id}>
              <CardBody className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">AMD: {c.amdSensitivity} · Transfer: {c.transferPhone}</p>
                </div>
                <Badge label={c.status} />
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => toggleStatus(c.id, c.status)}
                    className="text-xs"
                  >
                    {c.status === 'active' ? 'Pause' : 'Activate'}
                  </Button>
                  <Link to={`/campaigns/${c.id}/edit`}>
                    <Button variant="ghost" className="text-xs"><Pencil size={12} /></Button>
                  </Link>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(c.id, c.name)}
                    className="text-xs"
                    disabled={c.status === 'active'}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Campaigns() {
  return <ToastProvider><CampaignsInner /></ToastProvider>;
}
