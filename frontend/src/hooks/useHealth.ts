import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  services: {
    database: { status: string };
    ami: { status: string };
    vapi: { status: string };
  };
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthStatus>('/health').then(r => r.data),
    refetchInterval: 15_000,
  });
}
