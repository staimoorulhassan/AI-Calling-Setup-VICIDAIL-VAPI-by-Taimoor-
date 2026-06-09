import { Socket } from 'socket.io';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export function registerTranscriptHandlers(socket: Socket): void {
  socket.on('subscribe:transcript', async ({ callId }: { callId: string }) => {
    const room = `transcript:${callId}`;
    await socket.join(room);

    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) {
      socket.emit('error', { code: 4004, message: 'Call not found' });
      return;
    }

    const entries = await prisma.transcript.findMany({
      where: { callId },
      orderBy: { sequence: 'asc' },
    });

    socket.emit('transcript.history', { type: 'transcript.history', call_id: callId, entries });
    logger.info({ call_id: callId, socket_id: socket.id }, 'Client subscribed to transcript');

    if (call.status === 'ended' || call.status === 'failed') {
      socket.emit('call.ended', {
        type: 'call.ended', call_id: callId,
        disposition: call.disposition, ended_at: call.endedAt?.toISOString(),
      });
    }
  });

  socket.on('unsubscribe:transcript', ({ callId }: { callId: string }) => {
    socket.leave(`transcript:${callId}`);
  });
}
