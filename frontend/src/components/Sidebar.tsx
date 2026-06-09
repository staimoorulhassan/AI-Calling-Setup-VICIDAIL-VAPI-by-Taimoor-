import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PhoneCall, FlaskConical, Megaphone, BarChart3, HeartPulse, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLogout } from '@/hooks/useAuth';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calls',     icon: PhoneCall,        label: 'Call Logs' },
  { to: '/test',      icon: FlaskConical,     label: 'Agent Test' },
  { to: '/campaigns', icon: Megaphone,        label: 'Campaigns' },
  { to: '/metrics',   icon: BarChart3,        label: 'Metrics' },
  { to: '/health',    icon: HeartPulse,       label: 'Health' },
];

export function Sidebar() {
  const { mutate: logout } = useLogout();

  return (
    <aside className="w-56 flex flex-col bg-gray-900 text-gray-100 min-h-screen">
      <div className="px-5 py-4 border-b border-gray-700">
        <span className="font-semibold text-white tracking-tight">ACS</span>
      </div>
      <nav className="flex-1 py-3">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-2 py-2 text-sm text-gray-400 hover:text-white w-full rounded transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
