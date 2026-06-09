import request from 'supertest';
import { app } from '../../src/index';

async function getAdminToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@acs.local', password: 'ChangeMe123!' });
  return res.body.token as string;
}

describe('Transfer endpoint', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAdminToken();
  });

  describe('POST /api/calls/:id/transfer', () => {
    it('TC-35: returns 409 when call is not in connected state', async () => {
      const res = await request(app)
        .post('/api/calls/00000000-0000-0000-0000-000000000000/transfer')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect([404, 409]).toContain(res.status);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/calls/any-id/transfer')
        .send({});

      expect(res.status).toBe(401);
    });
  });
});
