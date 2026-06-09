import { VapiClient } from '@vapi-ai/server-sdk';
import crypto from 'crypto';
import { env } from './env';

export const vapiClient = new VapiClient({ token: env.VAPI_API_KEY });

export function validateVapiWebhookSecret(secret: string | string[] | undefined): boolean {
  if (!secret) return false;
  const provided = Array.isArray(secret) ? secret[0] : secret;
  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(env.VAPI_WEBHOOK_SECRET),
  );
}

export async function endVapiCall(vapiCallId: string): Promise<void> {
  await vapiClient.calls.end(vapiCallId);
}

export async function checkVapiHealth(): Promise<boolean> {
  try {
    await vapiClient.calls.list({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}
