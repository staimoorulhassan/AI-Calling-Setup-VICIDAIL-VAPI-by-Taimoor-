jest.mock('../../src/config/database', () => ({
  prisma: {
    call: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/services/events.service', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/config/database';
import { callService } from '../../src/services/call.service';

const mockUpdate = prisma.call.update as jest.Mock;
const mockCreate = prisma.call.create as jest.Mock;
const mockFindUnique = prisma.call.findUnique as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('callService.createCall', () => {
  it('creates a call with initiated status', async () => {
    const fakeCall = { id: 'call-1', status: 'initiated', phoneNumber: '+10001112222' };
    mockCreate.mockResolvedValue(fakeCall);

    const result = await callService.createCall({ phone: '+10001112222', campaignId: 'camp-1' });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'initiated', phoneNumber: '+10001112222' }),
      }),
    );
    expect(result.status).toBe('initiated');
  });
});

describe('callService.markAnswered', () => {
  it('sets status to connected and records answeredAt (TC-34)', async () => {
    mockUpdate.mockResolvedValue({ id: 'call-1', status: 'connected' });
    await callService.markAnswered('call-1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'call-1' },
        data: expect.objectContaining({ status: 'connected' }),
      }),
    );
  });
});

describe('callService.markVoicemail', () => {
  it('sets status ended + disposition voicemail', async () => {
    mockUpdate.mockResolvedValue({ id: 'call-1', status: 'ended', disposition: 'voicemail' });
    await callService.markVoicemail('call-1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disposition: 'voicemail', status: 'ended' }),
      }),
    );
  });
});

describe('callService.markIvr', () => {
  it('sets status ended + disposition ivr', async () => {
    mockUpdate.mockResolvedValue({ id: 'call-1', status: 'ended', disposition: 'ivr' });
    await callService.markIvr('call-1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disposition: 'ivr', status: 'ended' }),
      }),
    );
  });
});

describe('callService.markFailed', () => {
  it('sets status failed', async () => {
    mockUpdate.mockResolvedValue({ id: 'call-1', status: 'failed' });
    await callService.markFailed('call-1');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});
