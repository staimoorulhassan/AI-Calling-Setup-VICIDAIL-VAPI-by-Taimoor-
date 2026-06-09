import { Prisma, EventSource } from '@prisma/client';
import { prisma } from '../config/database';
import { emitToAll } from '../ws/index';
import { logger } from '../utils/logger';

export type EventType =
  | 'call.initiated'
  | 'call.ringing'
  | 'call.answered'
  | 'call.amd_detected'
  | 'call.ivr_detected'
  | 'call.voicemail_hangup'
  | 'call.ivr_hangup'
  | 'call.transfer_initiated'
  | 'call.verifier_joined'
  | 'call.ai_exited'
  | 'call.ended'
  | 'call.failed';

export async function emitEvent(
  callId: string,
  eventType: EventType,
  source: EventSource,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const event = await prisma.callEvent.create({
    data: {
      callId,
      eventType,
      source,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  emitToAll(eventType, { call_id: callId, event_id: event.id, payload, occurred_at: event.occurredAt });
  logger.info({ call_id: callId, event_type: eventType, source }, 'Call event emitted');
}
