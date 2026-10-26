import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { audit } from '../services/audit.service.js';
import { recalcBill } from '../services/billing.service.js';
import { emitToRestaurant } from '../realtime/socket.js';

const router = Router();
router.use(requireAuth);

const openSchema = z.object({
  tableId: z.string(),
  customerName: z.string().optional(),
  partySize: z.number().int().positive().default(1),
  reservationId: z.string().optional(),
  waiterId: z.string().optional(),
});

router.post('/', validateBody(openSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { tableId, customerName, partySize, reservationId, waiterId } = req.body;
    const table = await prisma.restaurantTable.findFirst({ where: { id: tableId, restaurantId: req.user.restaurantId } });
    if (!table) throw new HttpError(404, 'Table not found');
    if (table.status === 'OUT_OF_SERVICE') throw new HttpError(400, 'Table out of service');

    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.tableSession.findFirst({ where: { tableId, status: 'ACTIVE' } });
      if (existing) throw new HttpError(409, 'Table already has an active session');
      if (reservationId) {
        const reservation = await tx.reservation.findFirst({
          where: { id: reservationId, restaurantId: req.user.restaurantId, status: { in: ['PENDING', 'CONFIRMED'] } },
        });
        if (!reservation) throw new HttpError(400, 'Invalid or unavailable reservation');
        if (reservation.tableId && reservation.tableId !== tableId) throw new HttpError(400, 'Reservation is assigned to another table');
        const reservationSession = await tx.tableSession.findFirst({ where: { reservationId } });
        if (reservationSession) throw new HttpError(409, 'Reservation already has a table session');
      }
      const assignedWaiter = waiterId || req.user.id;
      // validate waiter
      const waiter = await tx.user.findFirst({ where: { id: assignedWaiter, restaurantId: req.user.restaurantId, active: true } });
      if (!waiter) throw new HttpError(400, 'Invalid waiter');
      const s = await tx.tableSession.create({
        data: {
          restaurantId: req.user.restaurantId,
          tableId,
          customerName,
          partySize,
          waiterId: assignedWaiter,
          reservationId: reservationId || undefined,
          status: 'ACTIVE',
        },
      });
      await tx.restaurantTable.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      // create bill
      const billCount = await tx.bill.count({ where: { restaurantId: req.user.restaurantId } });
      await tx.bill.create({
        data: { restaurantId: req.user.restaurantId, tableSessionId: s.id, billNumber: billCount + 1 },
      });
      if (reservationId) {
        await tx.reservation.update({ where: { id: reservationId }, data: { status: 'ARRIVED' } });
      }
      return s;
    });

    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'SESSION_OPENED', entityType: 'TableSession', entityId: session.id });
    emitToRestaurant(req.user.restaurantId, 'table-session:opened', { sessionId: session.id, tableId });
    res.status(201).json({ session });
  } catch (e) { next(e); }
});

router.get('/active', async (req: AuthedRequest, res, next) => {
  try {
    const sessions = await prisma.tableSession.findMany({
      where: { restaurantId: req.user.restaurantId, status: 'ACTIVE' },
      include: { table: true, waiter: { select: { id: true, name: true } }, orders: { include: { items: true } }, bill: true },
      orderBy: { openedAt: 'desc' },
    });
    res.json({ sessions });
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const session = await prisma.tableSession.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      include: { table: true, waiter: { select: { id: true, name: true } }, orders: { include: { items: true, createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }, bill: { include: { payments: true, refunds: true, receipt: true } }, reservation: true },
    });
    if (!session) throw new HttpError(404, 'Session not found');
    res.json({ session });
  } catch (e) { next(e); }
});

router.post('/:id/transfer', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const { waiterId } = req.body;
    const session = await prisma.tableSession.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId, status: 'ACTIVE' } });
    if (!session) throw new HttpError(404, 'Active session not found');
    const waiter = await prisma.user.findFirst({ where: { id: waiterId, restaurantId: req.user.restaurantId, active: true } });
    if (!waiter) throw new HttpError(400, 'Invalid waiter');
    const updated = await prisma.tableSession.update({ where: { id: session.id }, data: { waiterId } });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'SESSION_TRANSFERRED', entityType: 'TableSession', entityId: session.id, before: { waiterId: session.waiterId }, after: { waiterId } });
    emitToRestaurant(req.user.restaurantId, 'table-session:transferred', { sessionId: session.id, waiterId });
    res.json({ session: updated });
  } catch (e) { next(e); }
});

router.post('/:id/close', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const session = await prisma.tableSession.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      include: { bill: true, table: true },
    });
    if (!session) throw new HttpError(404, 'Session not found');
    if (session.status !== 'ACTIVE') throw new HttpError(400, 'Session not active');
    if (session.bill && session.bill.status !== 'PAID' && session.bill.status !== 'CLOSED') {
      throw new HttpError(400, 'Bill not settled');
    }
    await prisma.$transaction(async (tx) => {
      await tx.tableSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      if (session.bill) {
        await tx.bill.update({ where: { id: session.bill.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      }
      await tx.restaurantTable.update({ where: { id: session.tableId }, data: { status: 'AVAILABLE' } });
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'SESSION_CLOSED', entityType: 'TableSession', entityId: session.id });
    emitToRestaurant(req.user.restaurantId, 'table-session:closed', { sessionId: session.id, tableId: session.tableId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
