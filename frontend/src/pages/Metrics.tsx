import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { useMetrics } from '@/hooks/useMetrics';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function Metrics() {
  const { data: metrics = [], isLoading } = useMetrics();

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const barData = metrics.map(m => ({
    name: m.campaignName.slice(0, 16),
    'Answer %': (m.answerRate * 100).toFixed(1),
    'Transfer %': (m.transferRate * 100).toFixed(1),
  }));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Metrics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => (
          <Card key={m.campaignId}>
            <CardHeader><p className="text-sm font-medium truncate">{m.campaignName}</p></CardHeader>
            <CardBody className="space-y-1 text-sm">
              <StatRow label="Total calls" value={m.total} />
              <StatRow label="Answer rate" value={`${(m.answerRate * 100).toFixed(1)}%`} />
              <StatRow label="Transfer rate" value={`${(m.transferRate * 100).toFixed(1)}%`} />
              <StatRow label="Avg duration" value={`${m.avgDurationSec.toFixed(0)}s`} />
            </CardBody>
          </Card>
        ))}
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader><p className="text-sm font-medium">Answer & Transfer Rates by Campaign</p></CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Answer %" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Transfer %" fill="#22c55e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {metrics[0] && (
            <Card>
              <CardHeader><p className="text-sm font-medium">Dispositions — {metrics[0].campaignName}</p></CardHeader>
              <CardBody>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={Object.entries(metrics[0].dispositions).map(([name, value]) => ({ name, value }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {Object.keys(metrics[0].dispositions).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
