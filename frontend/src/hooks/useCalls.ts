import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';

export interface Call {
  id: string; vapiCallId: string | null; campaignId: string | null;
  status: string; disposition: string | null; phone: string;
  startedAt: string; endedAt: string | null; durationSec: number | null;
  transferPhone: string | null; isTest: boolean;
}

interface CallsResponse { data: Call[]; total: number; page: number; pageSize: number }

export function useCalls(params: {
  page?: number; pageSize?: number; campaignId?: string;
  status?: string; disposition?: string; dateFrom?: string; dateTo?: string;
} = {}) {
  return useQuery({
    queryKey: ['calls', params],
    queryFn: () => api.get<CallsResponse>('/calls', { params }).then(r => r.data),
  });
}

export function useLiveCalls() {
  return useQuery({
    queryKey: ['calls', 'live'],
    queryFn: () => api.get<Call[]>('/calls/live').then(r => r.data),
    refetchInterval: 5000,
  });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: ['calls', id],
    queryFn: () => api.get<Call>(`/calls/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCallTranscript(id: string) {
  return useQuery({
    queryKey: ['calls', id, 'transcript'],
    queryFn: () =>
      api.get<{ role: string; content: string; timestamp: string }[]>(
        `/calls/${id}/transcript`,
      ).then(r => r.data),
    enabled: !!id,
  });
}

export function useCallEvents(id: string) {
  return useQuery({
    queryKey: ['calls', id, 'events'],
    queryFn: () =>
      api.get<{ id: string; eventType: string; source: string; payload: unknown; createdAt: string }[]>(
        `/calls/${id}/events`,
      ).then(r => r.data),
    enabled: !!id,
  });
}
