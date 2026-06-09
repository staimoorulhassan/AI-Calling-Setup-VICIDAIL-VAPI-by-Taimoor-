import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from '@/api/client';
import type { Call } from './useCalls';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export function useCallsBoard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(WS_URL, {
      auth: { token: getToken() },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('live_board', (data: Call[]) => setCalls(data));
    socket.on('call_update', (updated: Call) =>
      setCalls(prev => {
        const idx = prev.findIndex(c => c.id === updated.id);
        if (updated.status === 'ended' || updated.status === 'failed') {
          return prev.filter(c => c.id !== updated.id);
        }
        if (idx === -1) return [updated, ...prev];
        const next = [...prev];
        next[idx] = updated;
        return next;
      }),
    );

    return () => { socket.disconnect(); };
  }, []);

  return calls;
}
