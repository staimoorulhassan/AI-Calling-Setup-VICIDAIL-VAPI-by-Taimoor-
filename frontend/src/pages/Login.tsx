import { useState, FormEvent } from 'react';
import { useLogin } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending, error } = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login({ email, password });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Sign in to ACS</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@acs.local"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">
                {(error as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Login failed'}
              </p>
            )}
            <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
              {isPending ? <Spinner className="text-white" /> : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
