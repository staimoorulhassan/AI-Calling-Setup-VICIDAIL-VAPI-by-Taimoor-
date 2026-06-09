import axios from 'axios';
import { env } from './env';
import { logger } from '../utils/logger';

const avrAmiClient = axios.create({
  baseURL: env.AVR_AMI_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

export async function amiHangup(channel: string): Promise<void> {
  try {
    await avrAmiClient.post('/hangup', { uuid: channel });
    logger.info({ channel }, 'AMI hangup sent');
  } catch (err) {
    logger.error({ err, channel }, 'AMI hangup failed');
    throw err;
  }
}

export async function amiOriginate(params: {
  channel: string;
  exten: string;
  context?: string;
  priority?: number;
  callerid?: string;
}): Promise<void> {
  try {
    await avrAmiClient.post('/originate', {
      channel: params.channel,
      exten: params.exten,
      context: params.context ?? 'default',
      priority: params.priority ?? 1,
      callerid: params.callerid ?? 'ACS <acs>',
    });
    logger.info({ params }, 'AMI originate sent');
  } catch (err) {
    logger.error({ err, params }, 'AMI originate failed');
    throw err;
  }
}

export async function amiTransfer(params: {
  uuid: string;
  exten: string;
  context?: string;
  priority?: number;
}): Promise<void> {
  try {
    await avrAmiClient.post('/transfer', {
      uuid: params.uuid,
      exten: params.exten,
      context: params.context ?? 'default',
      priority: params.priority ?? 1,
    });
    logger.info({ params }, 'AMI transfer sent');
  } catch (err) {
    logger.error({ err, params }, 'AMI transfer failed');
    throw err;
  }
}

export async function amiGetVariables(uuid: string): Promise<Record<string, string>> {
  try {
    const { data } = await avrAmiClient.post('/variables', { uuid });
    return data as Record<string, string>;
  } catch (err) {
    logger.error({ err, uuid }, 'AMI get variables failed');
    throw err;
  }
}

export async function checkAmiHealth(): Promise<boolean> {
  try {
    await avrAmiClient.get('/health');
    return true;
  } catch {
    return false;
  }
}
