import { useHealth } from '@/hooks/useHealth';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusIndicator } from '@/components/StatusIndicator';
import { Spinner } from '@/components/ui/Spinner';

export function Health() {
  const { data, isLoading, error } = useHealth();

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">System Health</h1>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : error ? (
        <p className="text-red-600 text-sm">Failed to fetch health status</p>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Overall Status</p>
              {data && <StatusIndicator status={data.status} label={data.status.toUpperCase()} />}
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {data && Object.entries(data.services).map(([name, svc]) => (
              <div key={name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm font-medium capitalize">{name}</span>
                <StatusIndicator status={svc.status} label={svc.status} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
