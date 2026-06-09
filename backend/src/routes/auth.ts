import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { requireAuth, AuthPayload } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logger } from '../utils/logger';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    return;
  }

  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: '8h' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: req.ip,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info({ userId: user.id }, 'User logged in');

  res.json({
    token,
    expires_at: expiresAt.toISOString(),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  await prisma.session.updateMany({
    where: { tokenHash: req.tokenHash },
    data: { revokedAt: new Date() },
  });
  res.status(204).send();
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, name: true, role: true, lastLoginAt: true },
  });
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  res.json(user);
});

export default router;
