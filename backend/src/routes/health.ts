import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { checkAmiHealth } from '../config/ami';
import { checkVapiHealth } from '../config/vapi';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const [dbOk, amiOk, vapiOk] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkAmiHealth(),
    checkVapiHealth(),
  ]);

  const toStatus = (r: PromiseSettledResult<unknown>) =>
    r.status === 'fulfilled' && r.value !== false ? 'healthy' : 'unhealthy';

  const services = {
    database: toStatus(dbOk),
    vicidial: toStatus(amiOk),
    vapi: toStatus(vapiOk),
  };

  const overall = Object.values(services).every((s) => s === 'healthy')
    ? 'healthy'
    : Object.values(services).some((s) => s === 'healthy')
    ? 'degraded'
    : 'unhealthy';

  const status = overall === 'unhealthy' ? 503 : 200;
  res.status(status).json({ status: overall, services, checked_at: new Date().toISOString() });
});

export default router;
