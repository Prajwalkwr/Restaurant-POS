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

const CHECKOUT_ROUNDING_TOLERANCE_MINOR = 100;
const adjustmentSchema = z.object({
  discountPercent: z.number().finite().min(0).max(100).optional(),
  discountMinor: z.number().int().nonnegative().optional(),
  reason: z.string().trim().max(500).optional(),
}).refine((adjustment) => adjustment.discountPercent !== undefined || adjustment.discountMinor !== undefined, {
  message: 'Enter a discount percentage or amount.',
});

router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { status } = req.query as any;
    const where: any = { restaurantId: req.user.restaurantId };
    if (status) where.status = status;
    const bills = await prisma.bill.findMany({
      where,
      include: {
        tableSession: {
          include: {
            table: true,
            waiter: { select: { id: true, name: true } },
            orders: { include: { items: { include: { menuItem: { select: { imageUrl: true } } } } } },
          },
        },
        payments: true,
        receipt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const mapped = bills.map((b: any) => ({ ...b, balance: b.outstandingMinor, amountPaid: b.amountPaidMinor, grandTotal: b.grandTotalMinor, subtotal: b.subtotalMinor, tax: b.taxMinor, serviceCharge: b.serviceChargeMinor }));
    res.json({ bills: mapped });
  } catch (e) { next(e); }
});

router.get('/summary', async (req: AuthedRequest, res, next) => {
  try {
    const from = new Date(String(req.query.from ?? ''));
    const to = new Date(String(req.query.to ?? ''));
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw new HttpError(400, 'A valid summary date range is required');
    }

    const restaurantId = req.user.restaurantId;
    const metric = req.query.metric;
    if (metric !== undefined && !['OUTSTANDING', 'OPEN_BILLS', 'COLLECTED_TODAY', 'RECEIPTS_TODAY'].includes(String(metric))) {
      throw new HttpError(400, 'Invalid billing summary metric');
    }
    const [openBills, outstanding, collected, receipts, matchingBillCount, matchingBills] = await Promise.all([
      prisma.bill.count({
        where: { restaurantId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      }),
      prisma.bill.aggregate({
        where: { restaurantId, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        _sum: { outstandingMinor: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: from, lt: to },
          bill: { is: { restaurantId } },
        },
        _sum: { amountMinor: true },
      }),
      prisma.receipt.count({
        where: {
          issuedAt: { gte: from, lt: to },
          bill: { is: { restaurantId } },
        },
      }),
      metric ? prisma.bill.count({ where: {
        restaurantId,
        ...(metric === 'OUTSTANDING' ? {
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          outstandingMinor: { gt: 0 },
        } : {}),
        ...(metric === 'OPEN_BILLS' ? { status: { in: ['OPEN', 'PARTIALLY_PAID'] } } : {}),
        ...(metric === 'COLLECTED_TODAY' ? {
          payments: { some: { status: 'COMPLETED', createdAt: { gte: from, lt: to } } },
        } : {}),
        ...(metric === 'RECEIPTS_TODAY' ? {
          receipt: { is: { issuedAt: { gte: from, lt: to } } },
        } : {}),
      } }) : Promise.resolve(0),
      metric ? prisma.bill.findMany({
        where: {
          restaurantId,
          ...(metric === 'OUTSTANDING' ? {
            status: { in: ['OPEN', 'PARTIALLY_PAID'] },
            outstandingMinor: { gt: 0 },
          } : {}),
          ...(metric === 'OPEN_BILLS' ? { status: { in: ['OPEN', 'PARTIALLY_PAID'] } } : {}),
          ...(metric === 'COLLECTED_TODAY' ? {
            payments: { some: { status: 'COMPLETED', createdAt: { gte: from, lt: to } } },
          } : {}),
          ...(metric === 'RECEIPTS_TODAY' ? {
            receipt: { is: { issuedAt: { gte: from, lt: to } } },
          } : {}),
        },
        select: {
          id: true,
          billNumber: true,
          status: true,
          grandTotalMinor: true,
          amountPaidMinor: true,
          outstandingMinor: true,
          tableSession: {
            select: {
              customerName: true,
              table: { select: { number: true } },
              waiter: { select: { name: true } },
              orders: {
                select: {
                  items: { select: { quantity: true, status: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }) : Promise.resolve([]),
    ]);

    res.json({
      summary: {
        outstandingMinor: outstanding._sum.outstandingMinor ?? 0,
        collectedTodayMinor: collected._sum.amountMinor ?? 0,
        receiptsToday: receipts,
        openBills,
      },
      matchingBillCount,
      matchingBills,
    });
  } catch (e) { next(e); }
});

router.get('/:id', async (req: AuthedRequest, res, next) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      include: {
        tableSession: { include: { table: true, waiter: { select: { id: true, name: true } }, orders: { include: { items: { include: { menuItem: { select: { imageUrl: true } } } }, createdBy: { select: { id: true, name: true } } } } } },
        payments: { include: { recordedBy: { select: { id: true, name: true } } } },
        refunds: true,
        receipt: true,
      },
    });
    if (!bill) throw new HttpError(404, 'Bill not found');
    const mapped = { ...bill, balance: bill.outstandingMinor, amountPaid: bill.amountPaidMinor, grandTotal: bill.grandTotalMinor, subtotal: bill.subtotalMinor, tax: bill.taxMinor, serviceCharge: bill.serviceChargeMinor };
    res.json({ bill: mapped });
  } catch (e) { next(e); }
});

router.post('/:id/payments', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const bill = await prisma.bill.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!bill) throw new HttpError(404, 'Bill not found');
    if (bill.status === 'CLOSED' || bill.status === 'VOIDED') throw new HttpError(400, 'Bill closed');
    const { method, amountMinor, idempotencyKey, tenderedMinor } = req.body;
    if (!method || !amountMinor || amountMinor <= 0) throw new HttpError(400, 'Invalid payment');
    // idempotency
    if (idempotencyKey) {
      const existing = await prisma.payment.findFirst({ where: { idempotencyKey, billId: bill.id } });
      if (existing) return res.json({ payment: existing, duplicate: true });
    }
    // prevent overpayment
    if (amountMinor > bill.outstandingMinor) throw new HttpError(400, 'Amount exceeds outstanding balance');

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          billId: bill.id,
          method,
          amountMinor,
          status: 'COMPLETED',
          idempotencyKey: idempotencyKey || undefined,
          recordedById: req.user.id,
          tenderedMinor: tenderedMinor ?? undefined,
          changeMinor: tenderedMinor ? tenderedMinor - amountMinor : undefined,
        },
      });
      await tx.bill.update({
        where: { id: bill.id },
        data: { amountPaidMinor: { increment: amountMinor } },
      });
      return p;
    });

    await recalcBill(bill.id);
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'PAYMENT_RECORDED', entityType: 'Payment', entityId: payment.id, after: payment });
    emitToRestaurant(req.user.restaurantId, 'bill:payment-recorded', { billId: bill.id, paymentId: payment.id });
    emitToRestaurant(req.user.restaurantId, 'bill:updated', { billId: bill.id });
    res.status(201).json({ payment });
  } catch (e) { next(e); }
});

router.post('/:id/close', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      include: { tableSession: true, receipt: true },
    });
    if (!bill) throw new HttpError(404, 'Bill not found');
    if (bill.receipt) {
      await prisma.$transaction(async (tx) => {
        await tx.tableSession.update({
          where: { id: bill.tableSessionId },
          data: { status: 'CLOSED', closedAt: bill.tableSession.closedAt || new Date() },
        });
        await tx.restaurantTable.update({ where: { id: bill.tableSession.tableId }, data: { status: 'AVAILABLE' } });
      });
      emitToRestaurant(req.user.restaurantId, 'table-session:closed', { sessionId: bill.tableSessionId });
      emitToRestaurant(req.user.restaurantId, 'session:closed', { sessionId: bill.tableSessionId });
      emitToRestaurant(req.user.restaurantId, 'table:updated', { tableId: bill.tableSession.tableId, status: 'AVAILABLE' });
      return res.json({ ok: true, receiptNumber: bill.receipt.receiptNumber, duplicate: true });
    }
    await recalcBill(bill.id);
    const fresh = await prisma.bill.findUnique({ where: { id: bill.id } });
    if (!fresh) throw new HttpError(404, 'Bill not found');
    if (fresh.outstandingMinor >= CHECKOUT_ROUNDING_TOLERANCE_MINOR) {
      throw new HttpError(400, 'Outstanding balance must be below NPR 1.00 to close without full payment.');
    }
    if (bill.tableSession.status !== 'ACTIVE') throw new HttpError(400, 'Table session is not active');
    // generate receipt
    const receiptCount = await prisma.receipt.count({ where: {} });
    const receiptNumber = `R-${String(receiptCount + 1).padStart(6, '0')}`;
    const receiptSnapshot = {
      ...fresh,
      status: 'PAID',
      outstandingMinor: 0,
    };
    await prisma.$transaction(async (tx) => {
      await tx.bill.update({ where: { id: bill.id }, data: { status: 'PAID', finalizedAt: new Date(), closedAt: new Date(), outstandingMinor: 0 } });
      await tx.receipt.create({
        data: { billId: bill.id, receiptNumber, snapshot: receiptSnapshot },
      });
      await tx.tableSession.update({ where: { id: bill.tableSessionId }, data: { status: 'CLOSED', closedAt: new Date() } });
      await tx.restaurantTable.update({ where: { id: bill.tableSession.tableId }, data: { status: 'AVAILABLE' } });
    });

    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'BILL_CLOSED',
      entityType: 'Bill',
      entityId: bill.id,
      before: { outstandingMinor: fresh.outstandingMinor, amountPaidMinor: fresh.amountPaidMinor },
      after: { outstandingMinor: 0, amountPaidMinor: fresh.amountPaidMinor },
      reason: fresh.outstandingMinor > 0 ? 'Sub-NPR 1 rounding balance waived at checkout.' : undefined,
    });
    emitToRestaurant(req.user.restaurantId, 'bill:paid', { billId: bill.id });
    emitToRestaurant(req.user.restaurantId, 'bill:closed', { billId: bill.id, tableSessionId: bill.tableSessionId });
    emitToRestaurant(req.user.restaurantId, 'table-session:closed', { sessionId: bill.tableSessionId });
    emitToRestaurant(req.user.restaurantId, 'session:closed', { sessionId: bill.tableSessionId });
    emitToRestaurant(req.user.restaurantId, 'table:updated', { tableId: bill.tableSession.tableId, status: 'AVAILABLE' });
    res.json({ ok: true, receiptNumber });
  } catch (e) { next(e); }
});

router.get('/:id/receipt', requireRole('ADMIN', 'BILLER'), async (req: AuthedRequest, res, next) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
      include: { tableSession: { include: { table: true, waiter: { select: { name: true } }, orders: { include: { items: true } } } }, payments: true, receipt: true, restaurant: true },
    });
    if (!bill) throw new HttpError(404, 'Bill not found');
    if (!bill.receipt) throw new HttpError(400, 'Generate the bill after recording full payment before printing a receipt');
    await prisma.receipt.update({ where: { id: bill.receipt.id }, data: { reprintCount: { increment: 1 } } });
    res.json({ bill });
  } catch (e) { next(e); }
});

router.post('/:id/adjustments', requireRole('ADMIN', 'BILLER'), validateBody(adjustmentSchema), async (req: AuthedRequest, res, next) => {
  try {
    const bill = await prisma.bill.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!bill) throw new HttpError(404, 'Bill not found');
    if (bill.status === 'CLOSED' || bill.status === 'VOIDED' || await prisma.receipt.findUnique({ where: { billId: bill.id } })) {
      throw new HttpError(400, 'A closed or finalized bill cannot be adjusted.');
    }

    const { discountPercent, discountMinor: requestedDiscountMinor, reason } = req.body as z.infer<typeof adjustmentSchema>;
    const freshBill = await recalcBill(bill.id);
    if (!freshBill) throw new HttpError(404, 'Bill not found');
    const discountMinor = discountPercent !== undefined
      ? Math.round(freshBill.subtotalMinor * discountPercent / 100)
      : requestedDiscountMinor!;
    if (discountMinor > freshBill.subtotalMinor) {
      throw new HttpError(400, 'Discount cannot exceed the bill subtotal.');
    }
    const discountedSubtotal = freshBill.subtotalMinor - discountMinor;
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
    if (!restaurant) throw new HttpError(404, 'Restaurant not found');
    const serviceMinor = Math.round(discountedSubtotal * restaurant.serviceChargeBps / 10_000);
    const taxMinor = Math.round((discountedSubtotal + serviceMinor) * restaurant.taxRateBps / 10_000);
    if (discountedSubtotal + serviceMinor + taxMinor < freshBill.amountPaidMinor) {
      throw new HttpError(400, 'Discount cannot reduce the bill total below the amount already paid.');
    }

    await prisma.bill.update({ where: { id: bill.id }, data: { discountMinor } });
    await recalcBill(bill.id);
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'BILL_ADJUSTED',
      entityType: 'Bill',
      entityId: bill.id,
      reason,
      before: { discountMinor: bill.discountMinor },
      after: { discountMinor, discountPercent: discountPercent ?? null },
    });
    emitToRestaurant(req.user.restaurantId, 'bill:updated', { billId: bill.id });
    res.json({ ok: true, discountMinor });
  } catch (e) { next(e); }
});

export default router;
