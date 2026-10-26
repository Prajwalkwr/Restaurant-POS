import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope@x.com', password: 'bad' });
    expect(res.status).toBe(401);
  });
  it.each([
    ['admin@restaurant.local', 'Admin@123', 'ADMIN'],
    ['waiterA@restaurant.local', 'Waiter@123', 'WAITER'],
    ['waiterB@restaurant.local', 'Waiter@123', 'WAITER'],
    ['biller@restaurant.local', 'Biller@123', 'BILLER'],
    ['kitchen@restaurant.local', 'Kitchen@123', 'KITCHEN'],
  ])('logs in %s with the expected role', async (email, password, role) => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('matches staff emails without case sensitivity', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'waitera@restaurant.local', password: 'Waiter@123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('WAITER');
  });

  it('does not expose staff password hashes in staff responses or update audit records', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'admin@restaurant.local', password: 'Admin@123' });
    expect(login.status).toBe(200);

    const email = `staff-${Date.now()}-${Math.random()}@example.test`;
    let staffId: string | undefined;
    try {
      const created = await agent.post('/api/staff').send({
        name: 'Password Privacy Test',
        email,
        password: 'Staff@123',
        role: 'WAITER',
      });
      expect(created.status).toBe(201);
      staffId = created.body.user.id;
      expect(created.body.user).not.toHaveProperty('password');
      expect(created.body.user).not.toHaveProperty('passwordHash');

      const updated = await agent.patch(`/api/staff/${staffId}`).send({ name: 'Updated Privacy Test' });
      expect(updated.status).toBe(200);
      expect(updated.body.user).not.toHaveProperty('passwordHash');

      const list = await agent.get('/api/staff');
      expect(list.status).toBe(200);
      expect(list.body.users.find((user: { id: string }) => user.id === staffId)).not.toHaveProperty('passwordHash');

      const staffAgent = request.agent(app);
      expect((await staffAgent.post('/api/auth/login').send({ email, password: 'Staff@123' })).status).toBe(200);
      const reset = await agent.post(`/api/staff/${staffId}/password`).send({ password: 'Changed@123' });
      expect(reset.status).toBe(200);
      expect(reset.body).toEqual({ ok: true });
      expect((await staffAgent.get('/api/auth/me')).status).toBe(401);
      expect((await request(app).post('/api/auth/login').send({ email, password: 'Staff@123' })).status).toBe(401);
      expect((await request(app).post('/api/auth/login').send({ email, password: 'Changed@123' })).status).toBe(200);

      const updateAudit = await prisma.auditLog.findFirst({
        where: { entityType: 'User', entityId: staffId, action: 'STAFF_UPDATED' },
      });
      expect(updateAudit?.before).not.toHaveProperty('passwordHash');

      const resetAudit = await prisma.auditLog.findFirst({
        where: { entityType: 'User', entityId: staffId, action: 'STAFF_PASSWORD_RESET' },
      });
      expect(resetAudit?.after).toBeNull();
      expect(JSON.stringify(resetAudit)).not.toContain('Changed@123');
    } finally {
      if (staffId) {
        await prisma.session.deleteMany({ where: { userId: staffId } });
        await prisma.auditLog.deleteMany({ where: { entityType: 'User', entityId: staffId } });
        await prisma.user.delete({ where: { id: staffId } });
      }
    }
  });

  it('does not expose the manager PIN verifier in authenticated restaurant responses', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'waiterA@restaurant.local', password: 'Waiter@123' });
    expect(login.status).toBe(200);

    const currentUser = await agent.get('/api/auth/me');
    expect(currentUser.status).toBe(200);
    expect(currentUser.body.user.restaurant).not.toHaveProperty('managerPinHash');
    expect(currentUser.body.user.restaurant).toHaveProperty('name');

    const settings = await agent.get('/api/settings');
    expect(settings.status).toBe(200);
    expect(settings.body.settings).not.toHaveProperty('managerPinHash');
    expect(settings.body.settings).toHaveProperty('name');
  });

  it('logs out and invalidates the active session', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'waiterA@restaurant.local', password: 'Waiter@123' });
    expect(login.status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(logout.body.ok).toBe(true);
    expect(logout.headers['set-cookie']?.some((cookie: string) => cookie.includes('sid=;'))).toBe(true);

    const currentUser = await agent.get('/api/auth/me');
    expect(currentUser.status).toBe(401);
  });

  it('prevents waiters from receiving payments, generating receipts, or requesting bills', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'waiterA@restaurant.local', password: 'Waiter@123' });
    expect(login.status).toBe(200);

    expect((await agent.post('/api/bills/not-a-bill/payments').send({})).status).toBe(403);
    expect((await agent.post('/api/bills/not-a-bill/close').send({})).status).toBe(403);
    expect((await agent.get('/api/bills/not-a-bill/receipt')).status).toBe(403);
    expect((await agent.post('/api/table-sessions/not-a-session/request-bill').send({})).status).toBe(404);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
  });

  it('prevents billers from creating or submitting waiter orders', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'biller@restaurant.local', password: 'Biller@123' });
    expect(login.status).toBe(200);

    expect((await agent.post('/api/orders').send({})).status).toBe(403);
    expect((await agent.post('/api/orders/not-an-order/submit').send({})).status).toBe(403);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
  });
});
