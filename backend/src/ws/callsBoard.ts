import { Socket } from 'socket.io';
import { prisma } from '../config/database';
import { getIO } from './index';

export function registerCallsBoardHandlers(socket: Socket) {
  sendSnapshot(socket);

  socket.on('disconnect', () => {});
}

async function sendSnapshot(socket: Socket) {
  try {
    const active = await prisma.call.findMany({
      where: { status: { notIn: ['ended', 'failed'] } },
      orderBy: { startedAt: 'desc' },
    });
    socket.emit('live_board', active);
  } catch (_) {}
}

export async function broadcastCallUpdate(call: object) {
  try {
    getIO().emit('call_update', call);
  } catch (_) {}
}
