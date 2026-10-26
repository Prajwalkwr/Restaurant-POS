import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { hashPassword } from '../services/auth.service.js';
import { audit } from '../services/audit.service.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['WAITER', 'BILLER', 'KITCHEN', 'ADMIN']),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6),
});

router.get('/', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { restaurantId: req.user.restaurantId },
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ users });
  } catch (e) { next(e); }
});

router.post('/', requireRole('ADMIN'), validateBody(createSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, 'Email already in use');
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { restaurantId: req.user.restaurantId, name, email, passwordHash, role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'STAFF_CREATED', entityType: 'User', entityId: user.id, after: user });
    res.status(201).json({ user });
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const { name, role, active } = req.body;
    const target = await prisma.user.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (!target) throw new HttpError(404, 'User not found');
    // prevent role escalation: admin cannot make someone admin? allow but audit. Prevent deactivating self? guard.
    if (target.id === req.user.id && active === false) throw new HttpError(400, 'Cannot deactivate yourself');
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { ...(name && { name }), ...(role && { role }), ...(typeof active === 'boolean' && { active }) },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    if (active === false) {
      // destroy sessions
      const { destroyAllUserSessions } = await import('../services/auth.service.js');
      await destroyAllUserSessions(target.id);
    }
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'STAFF_UPDATED', entityType: 'User', entityId: target.id, before: target, after: updated });
    res.json({ user: updated });
  } catch (e) { next(e); }
});

router.post('/:id/password', requireRole('ADMIN'), validateBody(resetPasswordSchema), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      select: { id: true },
    });
    if (!target) throw new HttpError(404, 'User not found');

    const passwordHash = await hashPassword(req.body.password);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });
    const { destroyAllUserSessions } = await import('../services/auth.service.js');
    await destroyAllUserSessions(target.id);
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'STAFF_PASSWORD_RESET',
      entityType: 'User',
      entityId: target.id,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/:id/deactivate', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.user.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.id === req.user.id) throw new HttpError(400, 'Cannot deactivate yourself');
    await prisma.user.update({ where: { id: target.id }, data: { active: false } });
    const { destroyAllUserSessions } = await import('../services/auth.service.js');
    await destroyAllUserSessions(target.id);
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'STAFF_DEACTIVATED', entityType: 'User', entityId: target.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
