import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, createSession, destroySession } from '../services/auth.service.js';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { serializeRestaurant } from '../utils/restaurantResponse.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    if (!user || !user.active) throw new HttpError(401, 'Invalid credentials');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new HttpError(401, 'Invalid credentials');
    const { token, expiresAt } = await createSession(user.id, { ip: req.ip, ua: req.get('user-agent') || undefined });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie('sid', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, restaurantId: user.restaurantId } });
  } catch (e) { next(e); }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.sid;
    res.clearCookie('sid', { path: '/' });
    if (token) await destroySession(token);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const u = req.user;
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, restaurantId: u.restaurantId, restaurant: serializeRestaurant(u.restaurant) } });
});

export default router;
