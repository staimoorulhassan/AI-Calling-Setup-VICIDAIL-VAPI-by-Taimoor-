import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

export interface AgentMetrics {
  campaignId: string; campaignName: string;
  total: number; answerRate: number; transferRate: number;
  avgDurationSec: number;
  dispositions: Record<string, number>;
}

export function useMetrics() {
  return useQuery({
    queryKey: ['metrics', 'agents'],
    queryFn: () => api.get<AgentMetrics[]>('/metrics/agents').then(r => r.data),
    refetchInterval: 30_000,
  });
}
