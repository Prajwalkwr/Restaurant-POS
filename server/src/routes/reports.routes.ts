import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { formatSalesCsv } from '../utils/reportCsv.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMIN', 'BILLER'));

type TrendPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

router.get('/analytics', async (req: AuthedRequest, res, next) => {
  try {
    const validPeriods: TrendPeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];
    const requestedPeriod = req.query.period;
    const period: TrendPeriod = typeof requestedPeriod === 'string' && validPeriods.includes(requestedPeriod as TrendPeriod)
      ? requestedPeriod as TrendPeriod
      : 'daily';

    const now = new Date();
    const today = startOfDay(now);
    const week = startOfWeek(now);
    const month = startOfMonth(now);
    const year = startOfYear(now);
    let trendStart: Date;
    let bucketCount: number;
    let bucketStart: (date: Date) => Date;
    let advanceBucket: (date: Date) => void;
    let trendLabel: (date: Date) => string;

    switch (period) {
      case 'weekly':
        trendStart = new Date(week);
        trendStart.setDate(trendStart.getDate() - 7 * 7);
        bucketCount = 8;
        bucketStart = startOfWeek;
        advanceBucket = (date) => date.setDate(date.getDate() + 7);
        trendLabel = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        break;
      case 'monthly':
        trendStart = new Date(year.getFullYear(), year.getMonth() - 11, 1);
        bucketCount = 12;
        bucketStart = startOfMonth;
        advanceBucket = (date) => date.setMonth(date.getMonth() + 1);
        trendLabel = (date) => date.toLocaleDateString('en-GB', { month: 'short' });
        break;
      case 'yearly':
        trendStart = new Date(year.getFullYear() - 4, 0, 1);
        bucketCount = 5;
        bucketStart = startOfYear;
        advanceBucket = (date) => date.setFullYear(date.getFullYear() + 1);
        trendLabel = (date) => String(date.getFullYear());
        break;
      default:
        trendStart = new Date(today);
        trendStart.setDate(trendStart.getDate() - 6);
        bucketCount = 7;
        bucketStart = startOfDay;
        advanceBucket = (date) => date.setDate(date.getDate() + 1);
        trendLabel = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }

    const bucketFor = (date: Date) => {
      const start = bucketStart(date);
      return period === 'monthly'
        ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        : period === 'yearly' ? String(start.getFullYear()) : dateKey(start);
    };

    const [bills, orders] = await Promise.all([
      prisma.bill.findMany({
        where: {
          restaurantId: req.user.restaurantId,
          status: { in: ['PAID', 'CLOSED'] },
          createdAt: { gte: trendStart, lte: now },
        },
        select: { createdAt: true, grandTotalMinor: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId: req.user.restaurantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: month, lte: now },
        },
        select: {
          items: {
            where: { status: { not: 'CANCELLED' } },
            select: { itemName: true, quantity: true, unitPriceMinor: true },
          },
        },
      }),
    ]);

    const sumBetween = (from: Date, to: Date) => bills.reduce(
      (total, bill) => bill.createdAt >= from && bill.createdAt < to
        ? total + bill.grandTotalMinor
        : total,
      0,
    );

    const bucketTotals = new Map<string, number>();
    const bucketDates: Date[] = [];
    const cursor = new Date(trendStart);
    for (let index = 0; index < bucketCount; index += 1) {
      const start = bucketStart(cursor);
      bucketDates.push(start);
      bucketTotals.set(bucketFor(start), 0);
      advanceBucket(cursor);
    }
    for (const bill of bills) {
      const key = bucketFor(bill.createdAt);
      if (bucketTotals.has(key)) {
        bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + bill.grandTotalMinor);
      }
    }

    const itemTotals = new Map<string, { name: string; quantity: number; totalMinor: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const current = itemTotals.get(item.itemName) ?? { name: item.itemName, quantity: 0, totalMinor: 0 };
        current.quantity += item.quantity;
        current.totalMinor += item.quantity * item.unitPriceMinor;
        itemTotals.set(item.itemName, current);
      }
    }

    res.json({
      sales: {
        daily: sumBetween(today, now),
        weekly: sumBetween(week, now),
        monthly: sumBetween(month, now),
        yearly: sumBetween(year, now),
      },
      trend: bucketDates.map((date) => ({
        date: dateKey(date),
        label: trendLabel(date),
        grossMinor: bucketTotals.get(bucketFor(date)) ?? 0,
      })),
      topItems: Array.from(itemTotals.values())
        .sort((a, b) => b.totalMinor - a.totalMinor)
        .slice(0, 6),
    });
  } catch (e) { next(e); }
});

router.get('/sales/daily', async (req: AuthedRequest, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    const bills = await prisma.bill.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        status: { in: ['PAID', 'CLOSED'] },
        createdAt: { gte: start, lt: end },
      },
      select: { createdAt: true, grandTotalMinor: true },
    });
    const dateKey = (date: Date) => [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const totals = new Map<string, number>();
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
      totals.set(dateKey(day), 0);
    }
    for (const bill of bills) {
      const key = dateKey(bill.createdAt);
      totals.set(key, (totals.get(key) ?? 0) + bill.grandTotalMinor);
    }
    res.json({ days: Array.from(totals, ([date, grossMinor]) => ({ date, grossMinor })) });
  } catch (e) { next(e); }
});

router.get('/sales/export.csv', async (req: AuthedRequest, res, next) => {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [restaurant, bills] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: req.user.restaurantId },
        select: { name: true, currency: true, timeZone: true },
      }),
      prisma.bill.findMany({
        where: {
          restaurantId: req.user.restaurantId,
          status: { in: ['PAID', 'CLOSED'] },
          createdAt: { gte: start, lte: end },
        },
        include: {
          tableSession: {
            include: {
              table: { select: { number: true } },
              orders: {
                where: { status: { not: 'CANCELLED' } },
                orderBy: { orderNumber: 'asc' },
                include: {
                  items: {
                    where: { status: { not: 'CANCELLED' } },
                    orderBy: { createdAt: 'asc' },
                    select: { itemName: true, quantity: true },
                  },
                },
              },
            },
          },
          payments: {
            where: { status: 'COMPLETED' },
            select: { method: true, amountMinor: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!restaurant) throw new HttpError(404, 'Restaurant not found');

    const csv = formatSalesCsv({
      restaurantName: restaurant.name,
      currency: restaurant.currency,
      timeZone: restaurant.timeZone,
      from: start,
      to: end,
      bills,
    });
    res
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="restaurant-sales.csv"')
      .send(`\uFEFF${csv}`);
  } catch (e) { next(e); }
});

router.get('/sales', async (req: AuthedRequest, res, next) => {
  try {
    const { from, to } = req.query as any;
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = to ? new Date(to) : new Date();
    const bills = await prisma.bill.findMany({
      where: { restaurantId: req.user.restaurantId, status: { in: ['PAID', 'CLOSED'] }, createdAt: { gte: start, lte: end } },
    });
    const gross = bills.reduce((s, b) => s + b.grandTotalMinor, 0);
    const discounts = bills.reduce((s, b) => s + b.discountMinor, 0);
    const tax = bills.reduce((s, b) => s + b.taxMinor, 0);
    const service = bills.reduce((s, b) => s + b.serviceChargeMinor, 0);
    res.json({ from: start, to: end, billCount: bills.length, grossMinor: gross, discountsMinor: discounts, taxMinor: tax, serviceChargeMinor: service, netMinor: gross });
  } catch (e) { next(e); }
});

router.get('/items', async (req: AuthedRequest, res, next) => {
  try {
    const { from, to } = req.query as any;
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = to ? new Date(to) : new Date();
    const orders = await prisma.order.findMany({
      where: { restaurantId: req.user.restaurantId, createdAt: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
      include: { items: true },
    });
    const map = new Map<string, { name: string; qty: number; total: number }>();
    for (const o of orders) for (const it of o.items) {
      if (it.status === 'CANCELLED') continue;
      const key = it.itemName;
      const cur = map.get(key) || { name: key, qty: 0, total: 0 };
      cur.qty += it.quantity;
      cur.total += it.unitPriceMinor * it.quantity;
      map.set(key, cur);
    }
    res.json({ items: Array.from(map.values()).sort((a, b) => b.total - a.total) });
  } catch (e) { next(e); }
});

router.get('/payments', async (req: AuthedRequest, res, next) => {
  try {
    const { from, to } = req.query as any;
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = to ? new Date(to) : new Date();
    const payments = await prisma.payment.findMany({
      where: { bill: { restaurantId: req.user.restaurantId }, createdAt: { gte: start, lte: end } },
    });
    const byMethod: Record<string, number> = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amountMinor;
    res.json({ totalMinor: payments.reduce((s, p) => s + p.amountMinor, 0), byMethod, count: payments.length });
  } catch (e) { next(e); }
});

export default router;
