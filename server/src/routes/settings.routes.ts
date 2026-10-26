import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { serializeRestaurant } from '../utils/restaurantResponse.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const r = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    res.json({ settings: r ? serializeRestaurant(r) : null });
  } catch (e) { next(e); }
});

router.patch('/', requireRole('ADMIN'), async (req: AuthedRequest, res, next) => {
  try {
    const { name, address, phone, email, timeZone, currency, taxRateBps, serviceChargeBps, receiptFooter } = req.body;
    const updated = await prisma.restaurant.update({
      where: { id: req.user.restaurantId },
      data: { ...(name && { name }), ...(address !== undefined && { address }), ...(phone !== undefined && { phone }), ...(email !== undefined && { email }), ...(timeZone && { timeZone }), ...(currency && { currency }), ...(taxRateBps !== undefined && { taxRateBps }), ...(serviceChargeBps !== undefined && { serviceChargeBps }), ...(receiptFooter !== undefined && { receiptFooter }) },
    });
    res.json({ settings: serializeRestaurant(updated) });
  } catch (e) { next(e); }
});

// Dashboard stats
router.get('/dashboard', async (req: AuthedRequest, res, next) => {
  try {
    const rid = req.user.restaurantId;
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const [tables, sessions, orders, bills, reservations] = await Promise.all([
      prisma.restaurantTable.findMany({ where: { restaurantId: rid } }),
      prisma.tableSession.findMany({ where: { restaurantId: rid, status: 'ACTIVE' } }),
      prisma.order.findMany({ where: { restaurantId: rid, createdAt: { gte: today, lt: tomorrow } } }),
      prisma.bill.findMany({ where: { restaurantId: rid, createdAt: { gte: today, lt: tomorrow } } }),
      prisma.reservation.findMany({ where: { restaurantId: rid, reservedAt: { gte: today, lt: tomorrow } } }),
    ]);
    const paidBills = bills.filter(b => b.status === 'PAID' || b.status === 'CLOSED');
    const gross = paidBills.reduce((s, b) => s + b.grandTotalMinor, 0);
    res.json({
      tables: { total: tables.length, occupied: tables.filter(t=>t.status==='OCCUPIED').length, available: tables.filter(t=>t.status==='AVAILABLE').length, reserved: tables.filter(t=>t.status==='RESERVED').length },
      activeSessions: sessions.length,
      orders: { total: orders.length, waiting: orders.filter(o=>o.status==='SUBMITTED').length, preparing: orders.filter(o=>o.status==='PREPARING').length, ready: orders.filter(o=>o.status==='READY').length },
      bills: { awaiting: bills.filter(b=>b.status==='OPEN'||b.status==='PARTIALLY_PAID').length, completed: paidBills.length },
      reservationsToday: reservations.length,
      grossSalesMinor: gross,
    });
  } catch (e) { next(e); }
});

export default router;
