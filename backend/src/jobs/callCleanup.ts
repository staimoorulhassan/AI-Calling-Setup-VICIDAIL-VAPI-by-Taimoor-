import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const STUCK_THRESHOLD_MINUTES = 60;

async function cleanStuckCalls(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

  const result = await prisma.call.updateMany({
    where: {
      status: { notIn: ['ended', 'failed'] },
      startedAt: { lt: cutoff },
    },
    data: { status: 'failed', endedAt: new Date() },
  });

  if (result.count > 0) {
    logger.warn({ count: result.count }, 'callCleanup: marked stuck calls as failed');
  }
}

export function startCallCleanupJob(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await cleanStuckCalls();
    } catch (err) {
      logger.error({ err }, 'callCleanup: job failed');
    }
  });
  logger.info('callCleanup: job scheduled (every 5 min)');
}
