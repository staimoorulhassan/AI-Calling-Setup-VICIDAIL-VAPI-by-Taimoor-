import axios, { AxiosInstance } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

let authToken: string | null = null;

export function setToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem('acs_token', token);
  else localStorage.removeItem('acs_token');
}

export function getToken(): string | null {
  if (authToken) return authToken;
  const stored = localStorage.getItem('acs_token');
  if (stored) authToken = stored;
  return authToken;
}

export function clearToken(): void { setToken(null); }

export const apiClient: AxiosInstance = axios.create({ baseURL: `${BASE_URL}/api` });

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      setToken(null);
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default apiClient;
