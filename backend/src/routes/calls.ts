import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { createCall, getActiveCalls } from '../services/call.service';
import { transferService } from '../services/transfer.service';

const router = Router();
router.use(requireAuth);

const listQuerySchema = z.object({
  campaign_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  disposition: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(1).max(200).default(50),
});

const testCallSchema = z.object({
  phone_number: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number'),
  campaign_id: z.string().uuid(),
});

const transferSchema = z.object({
  verifier_phone: z.string().optional(),
});

// GET /api/calls
router.get('/', validateQuery(listQuerySchema), async (req: Request, res: Response) => {
  const q = req.query as z.infer<typeof listQuerySchema>;
  const where = {
    ...(q.campaign_id && { campaignId: q.campaign_id }),
    ...(q.disposition && { disposition: q.disposition as never }),
    ...(q.from || q.to
      ? { startedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
  };
  const total = await prisma.call.count({ where });
  const calls = await prisma.call.findMany({
    where,
    include: { campaign: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
    skip: (q.page - 1) * q.per_page,
    take: q.per_page,
  });
  res.json({
    data: calls,
    pagination: { page: q.page, per_page: q.per_page, total, total_pages: Math.ceil(total / q.per_page) },
  });
});

// GET /api/calls/live
router.get('/live', async (_req: Request, res: Response) => {
  const calls = await getActiveCalls();
  res.json({ data: calls });
});

// GET /api/calls/export
router.get('/export', validateQuery(listQuerySchema.omit({ page: true, per_page: true })), async (req: Request, res: Response) => {
  const q = req.query as z.infer<typeof listQuerySchema>;
  const where = {
    ...(q.campaign_id && { campaignId: q.campaign_id }),
    ...(q.from || q.to
      ? { startedAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
  };
  const calls = await prisma.call.findMany({
    where,
    include: { campaign: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
  });

  const header = 'call_id,phone_number,campaign_name,started_at,ended_at,duration_seconds,disposition\n';
  const rows = calls.map((c) =>
    [c.id, c.phoneNumber, c.campaign.name, c.startedAt.toISOString(), c.endedAt?.toISOString() ?? '', c.durationSeconds ?? '', c.disposition ?? ''].join(','),
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="calls-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(header + rows);
});

// POST /api/calls/test
router.post('/test', validateBody(testCallSchema), async (req: Request, res: Response) => {
  const { phone_number, campaign_id } = req.body as z.infer<typeof testCallSchema>;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaign_id } });
  if (!campaign) { res.status(422).json({ error: 'NOT_FOUND', message: 'Campaign not found' }); return; }

  const call = await createCall({ campaignId: campaign_id, phoneNumber: phone_number, testMode: true, createdById: req.user!.userId });

  // Initiate VAPI call
  const { vapiClient } = await import('../config/vapi');
  try {
    const vapiCall = await vapiClient.calls.create({
      phoneNumberId: undefined as never,
      assistantId: campaign.vapiAssistantId ?? undefined,
      assistant: campaign.vapiAssistantId ? undefined : {
        model: { provider: 'openai', model: campaign.llmModel, messages: [{ role: 'system', content: campaign.systemPrompt }] },
        voice: { provider: '11labs', voiceId: campaign.voiceModel },
        firstMessage: campaign.firstMessage,
      },
      customer: { number: phone_number },
    } as never);
    await prisma.call.update({ where: { id: call.id }, data: { vapiCallId: (vapiCall as { id: string }).id } });
  } catch (err) {
    // Non-fatal for test initiation — log and continue
    require('../utils/logger').logger.warn({ err }, 'VAPI call create failed in test mode');
  }

  res.status(202).json({ call_id: call.id, ws_endpoint: `/ws/transcript/${call.id}` });
});

// GET /api/calls/:id
router.get('/:id', async (req: Request, res: Response) => {
  const call = await prisma.call.findUnique({
    where: { id: req.params.id },
    include: { campaign: { select: { name: true } } },
  });
  if (!call) { res.status(404).json({ error: 'NOT_FOUND', message: 'Call not found' }); return; }
  res.json(call);
});

// GET /api/calls/:id/transcript
router.get('/:id/transcript', async (req: Request, res: Response) => {
  const entries = await prisma.transcript.findMany({
    where: { callId: req.params.id },
    orderBy: { sequence: 'asc' },
  });
  res.json({ call_id: req.params.id, entries });
});

// GET /api/calls/:id/events
router.get('/:id/events', async (req: Request, res: Response) => {
  const events = await prisma.callEvent.findMany({
    where: { callId: req.params.id },
    orderBy: { occurredAt: 'asc' },
  });
  res.json({ call_id: req.params.id, events });
});

// POST /api/calls/:id/transfer
router.post('/:id/transfer', validateBody(transferSchema), async (req: Request, res: Response) => {
  const { verifier_phone } = req.body as z.infer<typeof transferSchema>;
  try {
    await transferService(req.params.id, verifier_phone);
    res.status(202).json({ call_id: req.params.id, status: 'transferring', verifier_phone: verifier_phone ?? null });
  } catch (err) {
    if (err instanceof Error && err.message.includes('not in a transferable state')) {
      res.status(409).json({ error: 'CONFLICT', message: err.message });
    } else if (err instanceof Error && err.message.includes('No verifier phone')) {
      res.status(422).json({ error: 'UNPROCESSABLE', message: err.message });
    } else {
      throw err;
    }
  }
});

export default router;
