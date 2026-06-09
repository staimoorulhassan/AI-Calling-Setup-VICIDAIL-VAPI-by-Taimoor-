import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';

const router = Router();
router.use(requireAuth);

const rangeSchema = z.object({ from: z.string().optional(), to: z.string().optional() });

router.get('/agents', validateQuery(rangeSchema), async (req: Request, res: Response) => {
  const q = req.query as z.infer<typeof rangeSchema>;
  const dateFilter = q.from || q.to
    ? { startedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
    : {};

  const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });

  const metrics = await Promise.all(
    campaigns.map(async (campaign) => {
      const calls = await prisma.call.findMany({
        where: { campaignId: campaign.id, ...dateFilter },
        select: { disposition: true, durationSeconds: true },
      });

      const total = calls.length;
      const answered = calls.filter((c) => c.disposition === 'answered').length;
      const transferred = calls.filter((c) => c.disposition === 'transferred').length;
      const totalDuration = calls.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0);
      const withDuration = calls.filter((c) => c.durationSeconds != null).length;

      const dispositionBreakdown = calls.reduce<Record<string, number>>((acc, c) => {
        const d = c.disposition ?? 'unknown';
        acc[d] = (acc[d] ?? 0) + 1;
        return acc;
      }, {});

      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        total_calls: total,
        answered_calls: answered,
        answer_rate: total > 0 ? answered / total : 0,
        transfer_count: transferred,
        transfer_rate: total > 0 ? transferred / total : 0,
        avg_duration_seconds: withDuration > 0 ? totalDuration / withDuration : 0,
        disposition_breakdown: dispositionBreakdown,
      };
    }),
  );

  res.json({ data: metrics });
});

export default router;
