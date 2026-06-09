import 'dotenv/config';
import { env } from './config/env';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { initWebSocket } from './ws/index';
import { startCallCleanupJob } from './jobs/callCleanup';
import { prisma } from './config/database';

// Routes
import authRouter from './routes/auth';
import campaignsRouter from './routes/campaigns';
import callsRouter from './routes/calls';
import metricsRouter from './routes/metrics';
import healthRouter from './routes/health';
import webhooksRouter from './routes/webhooks';

const app = express();
const httpServer = http.createServer(app);

// ─── Security & compression ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
app.use(compression());

// ─── Logging ──────────────────────────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ─── Rate limiting ────────────────────────────────────────────────────────
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests' },
  }),
);

// ─── Body parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/calls', callsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/health', healthRouter);
app.use('/api/webhooks', webhooksRouter);

// ─── WebSocket ────────────────────────────────────────────────────────────
initWebSocket(httpServer);

// ─── Error handler ────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────
async function start() {
  await prisma.$connect();
  logger.info('Database connected');

  startCallCleanupJob();

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'ACS backend started');
  });
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

export { app };
