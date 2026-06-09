import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/Sidebar';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { CallLogs } from '@/pages/CallLogs';
import { CallDetail } from '@/pages/CallDetail';
import { AgentTest } from '@/pages/AgentTest';
import { Campaigns } from '@/pages/Campaigns';
import { CampaignEditor } from '@/pages/CampaignEditor';
import { Metrics } from '@/pages/Metrics';
import { Health } from '@/pages/Health';

function AppLayout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="calls" element={<CallLogs />} />
          <Route path="calls/:id" element={<CallDetail />} />
          <Route path="test" element={<AgentTest />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/new" element={<CampaignEditor />} />
          <Route path="campaigns/:id/edit" element={<CampaignEditor />} />
          <Route path="metrics" element={<Metrics />} />
          <Route path="health" element={<Health />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<AppLayout />} />
      </Route>
    </Routes>
  );
}
