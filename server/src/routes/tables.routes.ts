import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.service.js';
import { emitToRestaurant } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const tables = await prisma.restaurantTable.findMany({
      where: { restaurantId: req.user.restaurantId },
      orderBy: { number: 'asc' },
    });
    // attach active session info
    const activeSessions = await prisma.tableSession.findMany({
      where: { restaurantId: req.user.restaurantId, status: 'ACTIVE' },
      include: {
        orders: { include: { items: true }, orderBy: { createdAt: 'asc' } },
        waiter: { select: { id: true, name: true } },
        bill: { select: { id: true, status: true, outstandingMinor: true } },
      },
    });
    const byTable = new Map(activeSessions.map(s => [s.tableId, s]));
    const enriched = tables.map(t => ({ ...t, activeSession: byTable.get(t.id) || null }));
    res.json({ tables: enriched });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  number: z.string().min(1),
  name: z.string().optional(),
  capacity: z.number().int().positive().default(4),
  section: z.string().optional(),
});

router.post('/', requireRole('ADMIN'), validateBody(createSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { number, name, capacity, section } = req.body;
    const exists = await prisma.restaurantTable.findUnique({ where: { restaurantId_number: { restaurantId: req.user.restaurantId, number } } });
    if (exists) throw new HttpError(409, 'Table number already exists');
    const table = await prisma.restaurantTable.create({
      data: { restaurantId: req.user.restaurantId, number, name, capacity, section },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'TABLE_CREATED', entityType: 'RestaurantTable', entityId: table.id, after: table });
    res.status(201).json({ table });
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.restaurantTable.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Table not found');
    const { number, name, capacity, section, status, active } = req.body;
    // validate status transitions? allow admin
    const updated = await prisma.restaurantTable.update({
      where: { id: target.id },
      data: { ...(number && { number }), ...(name !== undefined && { name }), ...(capacity && { capacity }), ...(section !== undefined && { section }), ...(status && { status }), ...(typeof active === 'boolean' && { active }) },
    });
    emitToRestaurant(req.user.restaurantId, 'table:updated', { table: updated });
    res.json({ table: updated });
  } catch (e) { next(e); }
});

export default router;
