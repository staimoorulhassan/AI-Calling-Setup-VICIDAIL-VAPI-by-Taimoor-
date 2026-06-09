import { useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from '@/hooks/useForm';
import { useCampaign, useCreateCampaign, useUpdateCampaign } from '@/hooks/useCampaigns';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ToastProvider, useToast } from '@/components/Toast';

interface CampaignForm {
  name: string; vapiAssistantId: string; transferPhone: string;
  amdSensitivity: string; maxCallsPerHour: string;
}

function CampaignEditorInner() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: existing, isLoading } = useCampaign(id ?? '');
  const { mutate: create, isPending: creating } = useCreateCampaign();
  const { mutate: update, isPending: updating } = useUpdateCampaign(id ?? '');

  const { values, set, reset } = useForm<CampaignForm>({
    name: '', vapiAssistantId: '', transferPhone: '',
    amdSensitivity: 'medium', maxCallsPerHour: '',
  });

  useEffect(() => {
    if (existing) {
      reset({
        name: existing.name,
        vapiAssistantId: existing.vapiAssistantId,
        transferPhone: existing.transferPhone,
        amdSensitivity: existing.amdSensitivity,
        maxCallsPerHour: existing.maxCallsPerHour?.toString() ?? '',
      });
    }
  }, [existing]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: values.name,
      vapiAssistantId: values.vapiAssistantId,
      transferPhone: values.transferPhone,
      amdSensitivity: values.amdSensitivity,
      maxCallsPerHour: values.maxCallsPerHour ? Number(values.maxCallsPerHour) : null,
    };
    const opts = {
      onSuccess: () => { toast(isEdit ? 'Campaign updated' : 'Campaign created', 'success'); navigate('/campaigns'); },
      onError: () => toast('Save failed', 'error'),
    };
    if (isEdit) update(body, opts);
    else create(body, opts);
  }

  if (isEdit && isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">{isEdit ? 'Edit Campaign' : 'New Campaign'}</h1>
      <Card>
        <CardHeader><p className="text-sm text-gray-600">Campaign settings</p></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Campaign Name" required>
              <input type="text" required value={values.name} onChange={e => set('name', e.target.value)} className={fieldClass} />
            </Field>
            <Field label="VAPI Assistant ID" required>
              <input type="text" required value={values.vapiAssistantId} onChange={e => set('vapiAssistantId', e.target.value)} className={fieldClass} placeholder="asst_..." />
            </Field>
            <Field label="Transfer Phone Number" required>
              <input type="tel" required value={values.transferPhone} onChange={e => set('transferPhone', e.target.value)} className={fieldClass} placeholder="+1234567890" />
            </Field>
            <Field label="AMD Sensitivity">
              <select value={values.amdSensitivity} onChange={e => set('amdSensitivity', e.target.value)} className={fieldClass}>
                {['low','medium','high'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Max Calls/Hour (optional)">
              <input type="number" min="1" value={values.maxCallsPerHour} onChange={e => set('maxCallsPerHour', e.target.value)} className={fieldClass} placeholder="Unlimited" />
            </Field>
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="primary" disabled={creating || updating}>
                {creating || updating ? <Spinner className="text-white" /> : (isEdit ? 'Save Changes' : 'Create Campaign')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/campaigns')}>Cancel</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

const fieldClass = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

export function CampaignEditor() {
  return <ToastProvider><CampaignEditorInner /></ToastProvider>;
}
