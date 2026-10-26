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
    const { date, status } = req.query as any;
    const where: any = { restaurantId: req.user.restaurantId };
    if (status) where.status = status;
    if (date) {
      const d = new Date(date);
      const start = new Date(d); start.setHours(0,0,0,0);
      const end = new Date(d); end.setHours(23,59,59,999);
      where.reservedAt = { gte: start, lte: end };
    }
    const reservations = await prisma.reservation.findMany({
      where, include: { table: true }, orderBy: { reservedAt: 'asc' },
    });
    res.json({ reservations });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  partySize: z.number().int().positive(),
  reservedAt: z.string(),
  tableId: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', validateBody(createSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { customerName, customerPhone, partySize, reservedAt, tableId, notes } = req.body;
    if (tableId) {
      const table = await prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId: req.user.restaurantId } });
      if (!table) throw new HttpError(404, 'Table not found');
      if (partySize > table.capacity) throw new HttpError(400, 'Party size exceeds capacity');
    }
    const reservation = await prisma.reservation.create({
      data: { restaurantId: req.user.restaurantId, customerName, customerPhone, partySize, reservedAt: new Date(reservedAt), tableId, notes, status: 'PENDING' },
      include: { table: true },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: reservation.id });
    emitToRestaurant(req.user.restaurantId, 'reservation:created', { reservationId: reservation.id });
    res.status(201).json({ reservation });
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.reservation.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Reservation not found');
    const { status, tableId, reservedAt, partySize, notes, customerName, customerPhone } = req.body;
    const updated = await prisma.reservation.update({
      where: { id: target.id },
      data: {
        ...(status && { status }),
        ...(tableId !== undefined && { tableId }),
        ...(reservedAt && { reservedAt: new Date(reservedAt) }),
        ...(partySize && { partySize }),
        ...(notes !== undefined && { notes }),
        ...(customerName && { customerName }),
        ...(customerPhone !== undefined && { customerPhone }),
      },
      include: { table: true },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'RESERVATION_UPDATED', entityType: 'Reservation', entityId: target.id });
    emitToRestaurant(req.user.restaurantId, 'reservation:updated', { reservationId: target.id });
    res.json({ reservation: updated });
  } catch (e) { next(e); }
});

router.post('/:id/cancel', async (req: AuthedRequest, res, next) => {
  try {
    const target = await prisma.reservation.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!target) throw new HttpError(404, 'Reservation not found');
    await prisma.reservation.update({ where: { id: target.id }, data: { status: 'CANCELLED' } });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: target.id });
    emitToRestaurant(req.user.restaurantId, 'reservation:cancelled', { reservationId: target.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
