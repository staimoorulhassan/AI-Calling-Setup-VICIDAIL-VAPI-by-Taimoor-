import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { env } from '../config/env';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      tokenHash?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or revoked' });
      return;
    }

    req.user = payload;
    req.tokenHash = tokenHash;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token' });
  }
}
