import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';

export interface Campaign {
  id: string; name: string; status: string; vapiAssistantId: string;
  transferPhone: string; amdSensitivity: string; maxCallsPerHour: number | null;
  createdAt: string; updatedAt: string;
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Campaign[]>('/campaigns').then(r => r.data),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => api.get<Campaign>(`/campaigns/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Campaign>) =>
      api.post<Campaign>('/campaigns', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Campaign>) =>
      api.patch<Campaign>(`/campaigns/${id}`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/campaigns/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSetCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/campaigns/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
