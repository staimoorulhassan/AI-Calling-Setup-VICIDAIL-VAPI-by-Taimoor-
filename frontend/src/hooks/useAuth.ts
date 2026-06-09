import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api, { setToken, clearToken } from '@/api/client';
import { setUser } from '@/stores/auth';

interface LoginPayload { email: string; password: string }
interface LoginResponse { token: string; user: { id: string; email: string; role: string } }

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ id: string; email: string; role: string }>('/auth/me').then(r => r.data),
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      api.post<LoginResponse>('/auth/login', payload).then(r => r.data),
    onSuccess: ({ token, user }) => {
      setToken(token);
      setUser(user);
      qc.setQueryData(['me'], user);
      navigate('/dashboard');
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout').then(r => r.data),
    onSettled: () => {
      clearToken();
      setUser(null);
      qc.clear();
      navigate('/login');
    },
  });
}
