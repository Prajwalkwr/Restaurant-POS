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

const WAITER_EDIT_WINDOW_MS = 5 * 60 * 1000;

function assertWaiterEditWindow(order: { status: string; submittedAt: Date | null }, role: string) {
  if (role !== 'WAITER' || order.status === 'DRAFT') return;
  if (['PREPARING', 'READY', 'SERVED'].includes(order.status)) {
    throw new HttpError(403, 'Waiters cannot edit an order once the kitchen starts preparing it.');
  }
  if (!order.submittedAt || Date.now() - order.submittedAt.getTime() >= WAITER_EDIT_WINDOW_MS) {
    throw new HttpError(403, 'Waiters can edit a submitted order for 5 minutes after submission.');
  }
}

// List orders (filters)
router.get('/', async (req: AuthedRequest, res, next) => {
  try {
    const { tableSessionId, status } = req.query as any;
    const where: any = { restaurantId: req.user.restaurantId };
    if (tableSessionId) where.tableSessionId = tableSessionId;
    if (status) where.status = status;
    const orders = await prisma.order.findMany({
      where,
      include: { items: true, createdBy: { select: { id: true, name: true } }, tableSession: { include: { table: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ orders });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  tableSessionId: z.string().optional(),
  sessionId: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
  items: z.array(z.object({
    menuItemId: z.string(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
  })).optional(),
});

router.post('/', requireRole('ADMIN', 'WAITER'), validateBody(createSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { tableSessionId, sessionId, notes, idempotencyKey, items } = req.body;
    const sid = tableSessionId || sessionId;
    if (!sid) throw new HttpError(400, 'sessionId required');
    const session = await prisma.tableSession.findFirst({ where: { id: sid, restaurantId: req.user.restaurantId }, include: { table: true, bill: true } });
    if (!session) throw new HttpError(404, 'Session not found');
    if (session.status !== 'ACTIVE') throw new HttpError(400, 'Session not active');

    if (idempotencyKey) {
      const existing = await prisma.order.findFirst({ where: { idempotencyKey, restaurantId: req.user.restaurantId } });
      if (existing) return res.json({ success: true, order: existing, bill: session.bill, duplicate: true });
    }

    // If items provided, create a full submitted batch in one transaction (template flow)
    if (Array.isArray(items) && items.length > 0) {
      const result = await prisma.$transaction(async (tx) => {
        let batchSubtotal = 0;
        const snapshots: any[] = [];
        for (const it of items) {
          const menuItem = await tx.menuItem.findFirst({ where: { id: it.menuItemId, restaurantId: req.user.restaurantId } });
          if (!menuItem || !menuItem.available || menuItem.soldOut) throw new HttpError(400, 'Menu item unavailable');
          const discountedPrice = Math.round(menuItem.priceMinor * (100 - (menuItem.discountPercent ?? 0)) / 100);
          const unitPrice = discountedPrice;
          const lineTotal = unitPrice * it.quantity;
          batchSubtotal += lineTotal;
          snapshots.push({
            menuItemId: menuItem.id,
            itemName: menuItem.name,
            unitPriceMinor: unitPrice,
            originalUnitPriceMinor: menuItem.priceMinor,
            itemDiscountPercent: menuItem.discountPercent ?? 0,
            quantity: it.quantity,
            notes: it.notes,
            status: 'PENDING',
          });
        }
        const orderCount = await tx.order.count({ where: { restaurantId: req.user.restaurantId } });
        const newOrder = await tx.order.create({
          data: {
            restaurantId: req.user.restaurantId,
            tableSessionId: sid,
            orderNumber: orderCount + 1,
            status: 'SUBMITTED',
            notes,
            idempotencyKey: idempotencyKey || undefined,
            createdById: req.user.id,
            submittedAt: new Date(),
            items: { create: snapshots },
          },
          include: { items: true, createdBy: { select: { id: true, name: true } }, tableSession: { include: { table: true } } },
        });

        // recalc bill
        let bill = session.bill;
        if (!bill) {
          const billCount = await tx.bill.count({ where: { restaurantId: req.user.restaurantId } });
          // use restaurant tax rates
          const restaurant = await tx.restaurant.findUnique({ where: { id: req.user.restaurantId } });
          const discountedSubtotal = batchSubtotal;
          const service = Math.round(discountedSubtotal * (restaurant?.serviceChargeBps || 0) / 10000);
          const tax = Math.round((discountedSubtotal + service) * (restaurant?.taxRateBps || 0) / 10000);
          const grand = discountedSubtotal + service + tax;
          bill = await tx.bill.create({
            data: { restaurantId: req.user.restaurantId, tableSessionId: sid, billNumber: billCount + 1, subtotalMinor: batchSubtotal, taxMinor: tax, serviceChargeMinor: service, grandTotalMinor: grand, amountPaidMinor: 0, outstandingMinor: grand, status: 'OPEN' },
          });
        } else {
          // recompute from all orders
          const orders = await tx.order.findMany({ where: { tableSessionId: sid, status: { not: 'CANCELLED' } }, include: { items: true } });
          let subtotal = 0;
          for (const o of orders) for (const it of o.items) { if (it.status !== 'CANCELLED') subtotal += it.unitPriceMinor * it.quantity; }
          const restaurant = await tx.restaurant.findUnique({ where: { id: req.user.restaurantId } });
          const discount = bill.discountMinor || 0;
          const discountedSubtotal = subtotal - discount;
          const service = Math.round(discountedSubtotal * (restaurant?.serviceChargeBps || 0) / 10000);
          const tax = Math.round((discountedSubtotal + service) * (restaurant?.taxRateBps || 0) / 10000);
          const grand = discountedSubtotal + service + tax;
          const outstanding = grand - bill.amountPaidMinor;
          bill = await tx.bill.update({ where: { id: bill.id }, data: { subtotalMinor: subtotal, taxMinor: tax, serviceChargeMinor: service, grandTotalMinor: grand, outstandingMinor: outstanding < 0 ? 0 : outstanding } });
        }
        return { newOrder, bill };
      });

      await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'ORDER_SUBMITTED', entityType: 'Order', entityId: result.newOrder.id });
      // broadcast
      const { emitToRestaurant } = await import('../realtime/socket.js');
      emitToRestaurant(req.user.restaurantId, 'order:created', { order: result.newOrder, bill: result.bill });
      emitToRestaurant(req.user.restaurantId, 'order:submitted', { orderId: result.newOrder.id, tableSessionId: sid });
      emitToRestaurant(req.user.restaurantId, 'kitchen:order-received', { order: result.newOrder });
      emitToRestaurant(req.user.restaurantId, 'bill:updated', { billId: result.bill.id, tableSessionId: sid });
      // also emit to named rooms via io
      try {
        const { getIO } = await import('../realtime/socket.js');
        const io = getIO();
        if (io) {
          io.to(`biller-${req.user.restaurantId}`).emit('order:created', { order: result.newOrder, bill: result.bill });
          io.to(`kitchen-${req.user.restaurantId}`).emit('kitchen:order-received', { order: result.newOrder });
        }
      } catch {}

      const b = result.bill as any;
      const billAlias = { ...b, balance: b.outstandingMinor, amountPaid: b.amountPaidMinor, grandTotal: b.grandTotalMinor, subtotal: b.subtotalMinor, tax: b.taxMinor, serviceCharge: b.serviceChargeMinor };
      return res.status(201).json({ success: true, message: 'Order submitted', order: result.newOrder, bill: billAlias });
    }

    // Otherwise create a draft order (existing flow)
    const orderCount = await prisma.order.count({ where: { restaurantId: req.user.restaurantId } });
    const order = await prisma.order.create({
      data: {
        restaurantId: req.user.restaurantId,
        tableSessionId: sid,
        orderNumber: orderCount + 1,
        status: 'DRAFT',
        notes,
        idempotencyKey: idempotencyKey || undefined,
        createdById: req.user.id,
      },
      include: { items: true },
    });
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'ORDER_CREATED', entityType: 'Order', entityId: order.id });
    res.status(201).json({ order });
  } catch (e) { next(e); }
});

// Add items to an order
const addItemSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().positive(),
  modifiers: z.any().optional(),
  notes: z.string().optional(),
  seatNumber: z.string().optional(),
});

router.post('/:id/items', requireRole('ADMIN', 'WAITER'), validateBody(addItemSchema), async (req: AuthedRequest, res, next) => {
  try {
    const { menuItemId, quantity, modifiers, notes, seatNumber } = req.body;
    const order = await prisma.order.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!order) throw new HttpError(404, 'Order not found');
    if (!['DRAFT', 'SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) {
      throw new HttpError(400, 'Cannot modify order in current status');
    }
    assertWaiterEditWindow(order, req.user.role);
    const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId: req.user.restaurantId } });
    if (!item) throw new HttpError(404, 'Menu item not found');
    if (!item.available || item.soldOut) throw new HttpError(400, 'Item unavailable');

    // compute modifier price
    let modifierPrice = 0;
    const modifierSnapshot: any[] = [];
    if (Array.isArray(modifiers)) {
      for (const m of modifiers) {
        // m: { groupId, optionId }
        const opt = await prisma.menuModifierOption.findUnique({ where: { id: m.optionId } });
        if (opt) {
          modifierPrice += opt.priceMinor;
          modifierSnapshot.push({ groupId: m.groupId, optionId: m.optionId, name: opt.name, priceMinor: opt.priceMinor });
        }
      }
    }
    const discountedPrice = Math.round(item.priceMinor * (100 - (item.discountPercent ?? 0)) / 100);
    const unitPrice = discountedPrice + modifierPrice;
    const originalUnitPrice = item.priceMinor + modifierPrice;
    const normalizedNotes = notes?.trim() || null;
    const normalizedSeatNumber = seatNumber?.trim() || null;
    const modifierKey = (values: Array<{ groupId?: string; optionId?: string }>) =>
      values.map(({ groupId, optionId }) => `${groupId ?? ''}:${optionId ?? ''}`).sort().join('|');
    const requestedModifierKey = modifierKey(modifierSnapshot);

    const { orderItem, merged } = await prisma.$transaction(async (tx) => {
      const pendingItems = await tx.orderItem.findMany({
        where: { orderId: order.id, menuItemId: item.id, status: 'PENDING' },
      });
      const existingItem = pendingItems.find((candidate) => {
        const savedModifiers = Array.isArray(candidate.modifiers)
          ? candidate.modifiers as Array<{ groupId?: string; optionId?: string }>
          : [];
        return candidate.unitPriceMinor === unitPrice
          && (candidate.originalUnitPriceMinor ?? candidate.unitPriceMinor) === originalUnitPrice
          && (candidate.itemDiscountPercent ?? 0) === (item.discountPercent ?? 0)
          && modifierKey(savedModifiers) === requestedModifierKey
          && (candidate.notes?.trim() || null) === normalizedNotes
          && (candidate.seatNumber?.trim() || null) === normalizedSeatNumber;
      });

      if (existingItem) {
        const updatedItem = await tx.orderItem.update({
          where: { id: existingItem.id },
          data: { quantity: { increment: quantity } },
        });
        return { orderItem: updatedItem, merged: true };
      }

      const createdItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: item.id,
          itemName: item.name,
          unitPriceMinor: unitPrice,
          originalUnitPriceMinor: originalUnitPrice,
          itemDiscountPercent: item.discountPercent ?? 0,
          quantity,
          modifiers: modifierSnapshot.length ? modifierSnapshot : undefined,
          notes: normalizedNotes,
          seatNumber: normalizedSeatNumber,
          status: 'PENDING',
        },
      });
      return { orderItem: createdItem, merged: false };
    });
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: merged ? 'ORDER_ITEM_UPDATED' : 'ORDER_ITEM_ADDED',
      entityType: 'OrderItem',
      entityId: orderItem.id,
      ...(merged && { after: { quantity: orderItem.quantity, itemName: orderItem.itemName } }),
    });
    if (order.status !== 'DRAFT') {
      const bill = await prisma.bill.findUnique({ where: { tableSessionId: order.tableSessionId } });
      if (bill) await recalcBill(bill.id);
      if (bill) emitToRestaurant(req.user.restaurantId, 'bill:updated', { billId: bill.id, tableSessionId: order.tableSessionId });
    }
    emitToRestaurant(req.user.restaurantId, 'order:items-updated', {
      orderId: order.id,
      tableSessionId: order.tableSessionId,
      itemId: orderItem.id,
      action: merged ? 'updated' : 'added',
      actorId: req.user.id,
    });
    res.status(201).json({ item: orderItem });
  } catch (e) { next(e); }
});

const updateItemSchema = z.object({
  quantity: z.number().int().nonnegative(),
  notes: z.string().optional(),
  reason: z.string().optional(),
  managerPin: z.string().optional(),
});

router.patch('/:id/items/:itemId', requireRole('ADMIN', 'WAITER'), validateBody(updateItemSchema), async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id as string, restaurantId: req.user.restaurantId },
    });
    if (!order) throw new HttpError(404, 'Order not found');
    if (!['DRAFT', 'SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) {
      throw new HttpError(400, 'Cannot modify an order in its current status');
    }
    assertWaiterEditWindow(order, req.user.role);

    const item = await prisma.orderItem.findFirst({
      where: { id: req.params.itemId as string, orderId: order.id },
    });
    if (!item) throw new HttpError(404, 'Item not found');
    if (item.status === 'CANCELLED') throw new HttpError(400, 'Cancelled items cannot be changed');

    const { quantity, notes, reason, managerPin } = req.body;

    const restricted = ['PREPARING', 'READY', 'SERVED'].includes(item.status);
    if (restricted) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
      if (!managerPin) throw new HttpError(403, 'Manager PIN required to modify preparing/ready item');
      const bcrypt = await import('bcryptjs');
      const validPin = restaurant?.managerPinHash ? await bcrypt.compare(managerPin, restaurant.managerPinHash) : false;
      if (!validPin && req.user.role !== 'ADMIN') throw new HttpError(403, 'Invalid manager PIN');
    } else if (req.user.role === 'WAITER' && !['PENDING'].includes(item.status)) {
      throw new HttpError(403, 'Cannot modify item in its current status');
    }

    const updatedItem = await prisma.orderItem.update({
      where: { id: item.id },
      data: quantity === 0
        ? { status: 'CANCELLED', ...(reason?.trim() && { cancelledReason: reason.trim() }) }
        : { quantity, ...(notes !== undefined && { notes }) },
    });
    const bill = order.status === 'DRAFT'
      ? null
      : await prisma.bill.findUnique({ where: { tableSessionId: order.tableSessionId } });
    if (bill) await recalcBill(bill.id);
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: quantity === 0 ? 'ORDER_ITEM_CANCELLED' : 'ORDER_ITEM_UPDATED',
      entityType: 'OrderItem',
      entityId: item.id,
      before: { quantity: item.quantity, status: item.status },
      after: { quantity: updatedItem.quantity, status: updatedItem.status },
      reason: reason?.trim() || undefined,
    });
    emitToRestaurant(req.user.restaurantId, 'order:items-updated', {
      orderId: order.id,
      tableSessionId: order.tableSessionId,
      itemId: item.id,
      action: quantity === 0 ? 'removed' : 'updated',
      actorId: req.user.id,
    });
    if (bill) emitToRestaurant(req.user.restaurantId, 'bill:updated', { billId: bill.id, tableSessionId: order.tableSessionId });
    res.json({ item: updatedItem });
  } catch (e) { next(e); }
});

// Submit order (DRAFT -> SUBMITTED)
router.post('/:id/submit', requireRole('ADMIN', 'WAITER'), async (req: AuthedRequest, res, next) => {
  try {
    const { idempotencyKey } = req.body || {};
    const order = await prisma.order.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId }, include: { items: true } });
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.status !== 'DRAFT') throw new HttpError(400, 'Order already submitted');
    if (order.items.length === 0) throw new HttpError(400, 'Order has no items');

    if (idempotencyKey) {
      const existing = await prisma.order.findFirst({ where: { idempotencyKey, restaurantId: req.user.restaurantId } });
      if (existing && existing.id !== order.id) return res.json({ order: existing, duplicate: true });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: order.id },
        data: { status: 'SUBMITTED', submittedAt: new Date(), ...(idempotencyKey && { idempotencyKey }) },
        include: { items: true },
      });
      // recalc bill
      const session = await tx.tableSession.findUnique({ where: { id: order.tableSessionId } });
      const bill = await tx.bill.findUnique({ where: { tableSessionId: order.tableSessionId } });
      if (bill) {
        // recalc outside tx? do inline
      }
      return o;
    });

    // recalc bill
    const bill = await prisma.bill.findUnique({ where: { tableSessionId: order.tableSessionId } });
    if (bill) await recalcBill(bill.id);

    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'ORDER_SUBMITTED', entityType: 'Order', entityId: order.id });
    emitToRestaurant(req.user.restaurantId, 'order:submitted', { orderId: order.id, tableSessionId: order.tableSessionId, actorId: req.user.id });
    emitToRestaurant(req.user.restaurantId, 'kitchen:order-received', { orderId: order.id, tableSessionId: order.tableSessionId, actorId: req.user.id });
    emitToRestaurant(req.user.restaurantId, 'bill:updated', { tableSessionId: order.tableSessionId });
    emitToRestaurant(req.user.restaurantId, 'order:items-updated', { orderId: order.id, tableSessionId: order.tableSessionId, action: 'submitted', actorId: req.user.id });
    res.json({ order: updated });
  } catch (e) { next(e); }
});

// Status change (kitchen/waiter)
const statusSchema = z.object({ status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']), reason: z.string().optional() });
router.patch('/:id/status', validateBody(statusSchema), async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!order) throw new HttpError(404, 'Order not found');
    const { status, reason } = req.body;
    // authorization: kitchen/admin/waiter can update; biller read-only
    if (req.user.role === 'BILLER') throw new HttpError(403, 'Forbidden');
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status, ...(status === 'CANCELLED' && { cancelledReason: reason }) },
    });
    // update items status too for simplicity
    if (status === 'PREPARING' || status === 'READY' || status === 'SERVED') {
      await prisma.orderItem.updateMany({ where: { orderId: order.id, status: { not: 'CANCELLED' } }, data: { status: status === 'PREPARING' ? 'PREPARING' : status === 'READY' ? 'READY' : 'SERVED' } });
    }
    await audit({ restaurantId: req.user.restaurantId, actorId: req.user.id, action: 'ORDER_STATUS_CHANGED', entityType: 'Order', entityId: order.id, before: { status: order.status }, after: { status }, reason });
    emitToRestaurant(req.user.restaurantId, 'order:status-changed', { orderId: order.id, status });
    if (status === 'READY') emitToRestaurant(req.user.restaurantId, 'kitchen:order-ready', { orderId: order.id });
    res.json({ order: updated });
  } catch (e) { next(e); }
});

// Cancel an order item
router.post('/:id/items/:itemId/cancel', async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!order) throw new HttpError(404, 'Order not found');
    assertWaiterEditWindow(order, req.user.role);
    const item = await prisma.orderItem.findFirst({ where: { id: req.params.itemId as string, orderId: order.id } });
    if (!item) throw new HttpError(404, 'Item not found');
    const { reason: submittedReason, reasonCode, managerPin } = req.body || {};
    const reason = typeof submittedReason === 'string' ? submittedReason.trim() : '';

    const restricted = item.status === 'PREPARING' || item.status === 'READY' || item.status === 'SERVED';
    if (restricted) {
      // require manager approval
      const restaurant = await prisma.restaurant.findUnique({ where: { id: req.user.restaurantId } });
      if (!managerPin) throw new HttpError(403, 'Manager PIN required to cancel preparing/ready item');
      const bcrypt = await import('bcryptjs');
      const ok = restaurant?.managerPinHash ? await bcrypt.compare(managerPin, restaurant.managerPinHash) : false;
      // also allow admin user without PIN? if role admin, allow
      if (!ok && req.user.role !== 'ADMIN') throw new HttpError(403, 'Invalid manager PIN');
    } else {
      // waiter can cancel directly if submitted/accepted/draft/pending
      if (req.user.role === 'WAITER' && !['DRAFT','SUBMITTED','ACCEPTED','PENDING'].includes(item.status)) {
        throw new HttpError(403, 'Cannot cancel in current status');
      }
    }

    await prisma.orderItem.update({
      where: { id: item.id },
      data: { status: 'CANCELLED', ...(reason && { cancelledReason: reason }) },
    });
    const bill = await prisma.bill.findUnique({ where: { tableSessionId: order.tableSessionId } });
    if (bill) await recalcBill(bill.id);
    await audit({
      restaurantId: req.user.restaurantId,
      actorId: req.user.id,
      action: 'ORDER_ITEM_CANCELLED',
      entityType: 'OrderItem',
      entityId: item.id,
      reason: reasonCode || reason || undefined,
      before: { status: item.status, quantity: item.quantity },
      after: { status: 'CANCELLED' },
    });
    emitToRestaurant(req.user.restaurantId, 'order:item-cancelled', { orderId: order.id, itemId: item.id, actorId: req.user.id });
    emitToRestaurant(req.user.restaurantId, 'order:items-updated', { orderId: order.id, tableSessionId: order.tableSessionId, itemId: item.id, action: 'removed', actorId: req.user.id });
    emitToRestaurant(req.user.restaurantId, 'bill:updated', { tableSessionId: order.tableSessionId });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
