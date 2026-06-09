import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AuthPayload } from '../middleware/auth';
import { registerCallsBoardHandlers } from './callsBoard';
import { registerTranscriptHandlers } from './transcript';

let io: SocketServer;

export function initWebSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/ws',
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (!token || typeof token !== 'string') {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
      (socket as Socket & { user: AuthPayload }).user = payload;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'WebSocket client connected');
    registerCallsBoardHandlers(socket);
    registerTranscriptHandlers(socket);
    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'WebSocket client disconnected');
    });
  });

  return io;
}

export function emitToAll(event: string, data: unknown): void {
  if (io) io.emit(event, data);
}

export function getIO(): SocketServer {
  if (!io) throw new Error('WebSocket server not initialized');
  return io;
}
