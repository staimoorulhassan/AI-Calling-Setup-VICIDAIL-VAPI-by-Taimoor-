import request from 'supertest';
import { app } from '../../src/index';

const ADMIN_EMAIL = 'admin@acs.local';
const ADMIN_PASS = 'ChangeMe123!';

describe('Auth endpoints', () => {
  let token: string;

  describe('POST /api/auth/login', () => {
    it('TC-19: returns JWT on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
      token = res.body.token;
    });

    it('TC-18: returns 401 on wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('TC-18: returns 401 on unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'anything' });

      expect(res.status).toBe(401);
    });

    it('returns 400 on missing fields', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('TC-16: returns user when JWT valid', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
      const jwt = loginRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('email', ADMIN_EMAIL);
    });

    it('TC-17: returns 401 when no JWT', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('TC-20: returns 401 on malformed/expired JWT', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 200 and invalidates the session', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASS });
      const jwt = loginRes.body.token;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${jwt}`);

      expect(logoutRes.status).toBe(200);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${jwt}`);

      expect(meRes.status).toBe(401);
    });
  });
});
