import { CallDisposition, CallStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { emitEvent } from './events.service';
import { amiHangup } from '../config/ami';
import { classifyIvr } from './ivrDetection';
import { callLogger } from '../utils/logger';

export async function createCall(params: {
  campaignId: string;
  phoneNumber: string;
  testMode?: boolean;
  createdById?: string;
}) {
  const call = await prisma.call.create({
    data: {
      campaignId: params.campaignId,
      phoneNumber: params.phoneNumber,
      testMode: params.testMode ?? false,
      createdById: params.createdById,
    },
  });
  await emitEvent(call.id, 'call.initiated', 'acsbackend', {
    campaign_id: params.campaignId,
    phone_number: params.phoneNumber,
  });
  emitCallUpdated(call.id, 'initiated');
  return call;
}

export async function markAnswered(callId: string, vapiCallId?: string) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'connected', answeredAt: new Date(), vapiCallId },
  });
  await emitEvent(callId, 'call.answered', 'vapi', { vapi_call_id: vapiCallId });
  emitCallUpdated(callId, 'connected');
  return call;
}

export async function processFirstTranscript(callId: string, text: string, channel?: string) {
  const log = callLogger(callId);
  const result = classifyIvr(text);
  if (result.isIvr) {
    log.warn({ matched: result.matchedPhrase }, 'IVR detected — hanging up');
    await emitEvent(callId, 'call.ivr_detected', 'acsbackend', { matched_phrase: result.matchedPhrase });
    if (channel) await amiHangup(channel).catch(() => null);
    await markIvr(callId);
  }
}

export async function markVoicemail(callId: string) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'ended', disposition: 'voicemail', endedAt: new Date() },
  });
  await emitEvent(callId, 'call.voicemail_hangup', 'amd');
  emitCallEnded(callId, 'voicemail');
  return call;
}

export async function markIvr(callId: string) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'ended', disposition: 'ivr', endedAt: new Date() },
  });
  await emitEvent(callId, 'call.ivr_hangup', 'acsbackend');
  emitCallEnded(callId, 'ivr');
  return call;
}

export async function markEnded(callId: string, disposition: CallDisposition, durationSeconds?: number) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: {
      status: 'ended',
      disposition,
      endedAt: new Date(),
      durationSeconds: durationSeconds ?? null,
    },
  });
  await emitEvent(callId, 'call.ended', 'vapi', { disposition, duration_seconds: durationSeconds });
  emitCallEnded(callId, disposition);
  return call;
}

export async function markFailed(callId: string, reason: string) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'failed', disposition: 'failed', endedAt: new Date() },
  });
  await emitEvent(callId, 'call.failed', 'acsbackend', { reason });
  emitCallEnded(callId, 'failed');
  return call;
}

export async function markTransferring(callId: string, verifierPhone: string) {
  const call = await prisma.call.update({
    where: { id: callId },
    data: { status: 'transferring', transferStartedAt: new Date() },
  });
  await emitEvent(callId, 'call.transfer_initiated', 'operator', { verifier_phone: verifierPhone });
  emitCallUpdated(callId, 'transferring');
  return call;
}

export async function persistTranscriptTurns(
  callId: string,
  turns: Array<{ role: string; message: string; time?: number }>,
) {
  const data = turns.map((turn, i) => ({
    callId,
    speaker: turn.role === 'assistant' ? 'ai' : 'human',
    text: turn.message,
    sequence: i + 1,
    spokenAt: turn.time ? new Date(turn.time * 1000) : new Date(),
  }));
  await prisma.transcript.createMany({ data });
}

function emitCallUpdated(callId: string, status: string) {
  const { emitToAll } = require('../ws/index');
  emitToAll('call.updated', { call_id: callId, status, updated_at: new Date().toISOString() });
}

function emitCallEnded(callId: string, disposition: string) {
  const { emitToAll } = require('../ws/index');
  emitToAll('call.ended', { call_id: callId, disposition, ended_at: new Date().toISOString() });
}

export async function getActiveCalls() {
  return prisma.call.findMany({
    where: { status: { notIn: ['ended', 'failed'] } },
    include: { campaign: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getCallWithCampaign(callId: string) {
  return prisma.call.findUnique({
    where: { id: callId },
    include: { campaign: true },
  });
}

export async function getCallByVapiId(vapiCallId: string) {
  return prisma.call.findUnique({ where: { vapiCallId } });
}

export async function updateCallStatus(callId: string, status: CallStatus) {
  return prisma.call.update({ where: { id: callId }, data: { status } });
}
