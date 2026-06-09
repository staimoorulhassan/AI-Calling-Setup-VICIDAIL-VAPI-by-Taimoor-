import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getToken } from '@/api/client';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

export interface TranscriptTurn { role: string; content: string; timestamp: string }

export function useTranscript(callId: string | null) {
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!callId) return;
    const socket = io(WS_URL, {
      auth: { token: getToken() },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.emit('subscribe:transcript', { callId });
    socket.on('transcript_turn', (turn: TranscriptTurn) =>
      setTurns(prev => [...prev, turn]),
    );

    return () => {
      socket.emit('unsubscribe:transcript', { callId });
      socket.disconnect();
      setTurns([]);
    };
  }, [callId]);

  return turns;
}
