import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1).max(200),
  system_prompt: z.string().min(1),
  first_message: z.string().min(1).max(500),
  voice_model: z.string().optional(),
  llm_model: z.string().optional(),
  language: z.string().optional(),
  amd_sensitivity: z.enum(['low', 'medium', 'high']).optional(),
  verifier_phone: z.string().optional(),
  caller_ids: z.array(z.string()).optional(),
  vicidial_campaign_id: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(['active', 'paused', 'disabled']) });

// GET /api/campaigns
router.get('/', async (req: Request, res: Response) => {
  const { status } = req.query;
  const campaigns = await prisma.campaign.findMany({
    where: status ? { status: status as 'active' | 'paused' | 'disabled' } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: campaigns });
});

// POST /api/campaigns
router.post('/', validateBody(createSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof createSchema>;
  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      systemPrompt: body.system_prompt,
      firstMessage: body.first_message,
      voiceModel: body.voice_model ?? '11labs-Rachel',
      llmModel: body.llm_model ?? 'gpt-4o-mini',
      language: body.language ?? 'en-US',
      amdSensitivity: body.amd_sensitivity ?? 'medium',
      verifierPhone: body.verifier_phone,
      callerIds: body.caller_ids ?? [],
      vicidialCampaignId: body.vicidial_campaign_id,
      createdById: req.user!.userId,
    },
  });
  res.status(201).json(campaign);
});

// GET /api/campaigns/:id
router.get('/:id', async (req: Request, res: Response) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) { res.status(404).json({ error: 'NOT_FOUND', message: 'Campaign not found' }); return; }
  res.json(campaign);
});

// PUT /api/campaigns/:id
router.put('/:id', validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  const body = req.body as Partial<z.infer<typeof createSchema>>;
  const campaign = await prisma.campaign.update({
    where: { id: req.params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.system_prompt && { systemPrompt: body.system_prompt }),
      ...(body.first_message && { firstMessage: body.first_message }),
      ...(body.voice_model && { voiceModel: body.voice_model }),
      ...(body.llm_model && { llmModel: body.llm_model }),
      ...(body.language && { language: body.language }),
      ...(body.amd_sensitivity && { amdSensitivity: body.amd_sensitivity }),
      ...(body.verifier_phone !== undefined && { verifierPhone: body.verifier_phone }),
      ...(body.caller_ids && { callerIds: body.caller_ids }),
      ...(body.vicidial_campaign_id !== undefined && { vicidialCampaignId: body.vicidial_campaign_id }),
    },
  });
  res.json(campaign);
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) { res.status(404).json({ error: 'NOT_FOUND', message: 'Campaign not found' }); return; }
  if (campaign.status === 'active') {
    res.status(409).json({ error: 'CONFLICT', message: 'Disable the campaign before deleting' });
    return;
  }
  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// PATCH /api/campaigns/:id/status
router.patch('/:id/status', validateBody(statusSchema), async (req: Request, res: Response) => {
  const { status } = req.body as z.infer<typeof statusSchema>;
  const campaign = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { status },
  });
  res.json(campaign);
});

export default router;
