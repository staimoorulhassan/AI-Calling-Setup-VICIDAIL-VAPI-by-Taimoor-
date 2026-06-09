import { getToken, setToken, clearToken } from '@/api/client';

export interface AuthUser { id: string; email: string; role: string }

let _user: AuthUser | null = null;

export function getUser(): AuthUser | null { return _user; }
export function setUser(u: AuthUser | null) { _user = u; }
export function isAuthenticated(): boolean { return !!getToken(); }

export function logout() {
  clearToken();
  setUser(null);
}
