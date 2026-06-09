import request from 'supertest';
import { app } from '../../src/index';

async function getAdminToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@acs.local', password: 'ChangeMe123!' });
  return res.body.token as string;
}

describe('Calls endpoints', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAdminToken();
  });

  describe('GET /api/calls', () => {
    it('TC-10: returns paginated call list with expected fields', async () => {
      const res = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const call = res.body.data[0];
        expect(call).toHaveProperty('id');
        expect(call).toHaveProperty('status');
        expect(call).toHaveProperty('startedAt');
      }
    });

    it('TC-11: accepts filter params without error', async () => {
      const res = await request(app)
        .get('/api/calls?status=ended&disposition=answered&page=1&pageSize=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/calls');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/calls/live', () => {
    it('returns array of active calls', async () => {
      const res = await request(app)
        .get('/api/calls/live')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/calls/export', () => {
    it('TC-28: returns CSV content-type', async () => {
      const res = await request(app)
        .get('/api/calls/export')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });
  });

  describe('GET /api/calls/:id', () => {
    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .get('/api/calls/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
