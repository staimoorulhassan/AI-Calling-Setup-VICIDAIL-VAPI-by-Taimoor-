import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: err.issues,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'CONFLICT', message: 'Resource already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Resource not found' });
      return;
    }
  }

  if (err instanceof Error) {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    return;
  }

  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unknown error' });
}
