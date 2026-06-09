import { prisma } from '../config/database';
import { amiOriginate } from '../config/ami';
import { endVapiCall } from '../config/vapi';
import { markTransferring, markEnded, markFailed } from './call.service';
import { emitEvent } from './events.service';
import { callLogger } from '../utils/logger';

export async function transferService(callId: string, overrideVerifierPhone?: string): Promise<void> {
  const log = callLogger(callId);

  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { campaign: true },
  });

  if (!call) throw new Error(`Call ${callId} not found`);
  if (call.status !== 'connected') throw new Error(`Call ${callId} is not in a transferable state (status: ${call.status})`);

  const verifierPhone = overrideVerifierPhone ?? call.campaign.verifierPhone;
  if (!verifierPhone) throw new Error('No verifier phone configured for this campaign');

  await markTransferring(callId, verifierPhone);

  try {
    // Originate a call to the verifier via avr-ami
    await amiOriginate({
      channel: `SIP/${verifierPhone}`,
      exten: 'conference',
      context: 'acs-transfer',
      priority: 1,
      callerid: `ACS Transfer <${call.phoneNumber}>`,
    });

    await prisma.call.update({
      where: { id: callId },
      data: { verifierJoinedAt: new Date() },
    });

    await emitEvent(callId, 'call.verifier_joined', 'vicidial', { verifier_phone: verifierPhone });

    // End the VAPI AI leg
    if (call.vapiCallId) {
      await endVapiCall(call.vapiCallId);
      await emitEvent(callId, 'call.ai_exited', 'vapi', {});
    }

    await markEnded(callId, 'transferred');
    log.info({ verifier_phone: verifierPhone }, '3-way transfer completed');
  } catch (err) {
    log.error({ err }, '3-way transfer failed');
    await markFailed(callId, `Transfer failed: ${err instanceof Error ? err.message : 'unknown'}`);
    throw err;
  }
}
