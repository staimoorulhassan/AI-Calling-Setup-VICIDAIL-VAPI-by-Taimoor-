import { Router, Request, Response } from 'express';
import { validateVapiWebhookSecret, endVapiCall } from '../config/vapi';
import { getCallByVapiId, markAnswered, markEnded, persistTranscriptTurns, processFirstTranscript } from '../services/call.service';
import { transferService } from '../services/transfer.service';
import { emitEvent } from '../services/events.service';
import { logger } from '../utils/logger';
import { getIO } from '../ws/index';

const router = Router();

router.post('/vapi', async (req: Request, res: Response) => {
  const secret = req.headers['x-vapi-secret'];
  if (!validateVapiWebhookSecret(secret)) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid webhook secret' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const type = body.type as string;
  const vapiCall = body.call as Record<string, string> | undefined;
  const vapiCallId = vapiCall?.id;

  logger.info({ type, vapi_call_id: vapiCallId }, 'VAPI webhook received');

  try {
    if (type === 'call-started' && vapiCallId) {
      const call = await getCallByVapiId(vapiCallId);
      if (call) await markAnswered(call.id, vapiCallId);
    }

    else if (type === 'transcript' && vapiCallId) {
      const call = await getCallByVapiId(vapiCallId);
      if (!call) { res.json({ result: 'ok' }); return; }

      const message = body.transcript as Record<string, unknown> | undefined;
      const text = (message?.transcript ?? '') as string;
      const role = (message?.role ?? 'assistant') as string;

      if (role === 'user' && call.status === 'connected') {
        await processFirstTranscript(call.id, text, call.vicidialChannel ?? undefined);
      }

      await emitEvent(call.id, 'call.answered', 'vapi', {});
      getIO().to(`transcript:${call.id}`).emit('transcript.turn', {
        type: 'transcript.turn',
        call_id: call.id,
        entry: { speaker: role === 'assistant' ? 'ai' : 'human', text, spoken_at: new Date().toISOString() },
      });
    }

    else if (type === 'tool-calls' && vapiCallId) {
      const toolCallList = body.toolCallList as Array<{ id: string; function: { name: string; arguments: string } }> | undefined;
      const transferCall = toolCallList?.find((t) => t.function.name === 'request_transfer');

      if (transferCall) {
        const call = await getCallByVapiId(vapiCallId);
        if (call) {
          await transferService(call.id);
          res.json({
            results: [{
              toolCallId: transferCall.id,
              result: 'Transfer initiated. Please say goodbye and stay on the line.',
            }],
          });
          return;
        }
      }
    }

    else if (type === 'end-of-call-report' && vapiCallId) {
      const call = await getCallByVapiId(vapiCallId);
      if (call) {
        const artifact = body.artifact as Record<string, unknown> | undefined;
        const messages = (artifact?.messages ?? []) as Array<{ role: string; message: string; time?: number }>;
        const durationMs = vapiCall?.['duration'] ? parseInt(vapiCall['duration']) : undefined;
        const durationSeconds = durationMs ? Math.round(durationMs / 1000) : undefined;
        const summary = (body.summary as string | undefined) ?? undefined;

        if (messages.length > 0) await persistTranscriptTurns(call.id, messages);
        if (summary) await import('../config/database').then(({ prisma }) => prisma.call.update({ where: { id: call.id }, data: { aiSummary: summary } }));

        await markEnded(call.id, 'answered', durationSeconds);

        getIO().to(`transcript:${call.id}`).emit('call.ended', {
          type: 'call.ended',
          call_id: call.id,
          disposition: 'answered',
          ended_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    logger.error({ err, type, vapi_call_id: vapiCallId }, 'VAPI webhook processing error');
  }

  res.json({ result: 'ok' });
});

export default router;
