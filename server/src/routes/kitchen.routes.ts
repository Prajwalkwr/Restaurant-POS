import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole, AuthedRequest } from '../middleware/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMIN', 'KITCHEN', 'WAITER'));

router.get('/orders', async (req: AuthedRequest, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.user.restaurantId,
        status: { in: ['SUBMITTED', 'ACCEPTED', 'PREPARING', 'READY'] },
        items: { some: { status: { not: 'CANCELLED' } } },
      },
      include: { items: true, tableSession: { include: { table: true } }, createdBy: { select: { id: true, name: true } } },
      orderBy: { submittedAt: 'asc' },
    });
    res.json({ orders });
  } catch (e) { next(e); }
});

router.patch('/orders/:id/status', async (req: AuthedRequest, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.id as string, restaurantId: req.user.restaurantId } });
    if (!order) throw new HttpError(404, 'Order not found');
    const { status } = req.body;
    const allowed = ['ACCEPTED', 'PREPARING', 'READY', 'SERVED'];
    if (!allowed.includes(status)) throw new HttpError(400, 'Invalid status');
    const updated = await prisma.order.update({ where: { id: order.id }, data: { status } });
    await prisma.orderItem.updateMany({ where: { orderId: order.id, status: { not: 'CANCELLED' } }, data: { status: status === 'PREPARING' ? 'PREPARING' : status === 'READY' ? 'READY' : status === 'SERVED' ? 'SERVED' : 'PENDING' } });
    const { emitToRestaurant } = await import('../realtime/socket.js');
    emitToRestaurant(req.user.restaurantId, 'kitchen:status-changed', { orderId: order.id, status });
    emitToRestaurant(req.user.restaurantId, 'order:status-changed', { orderId: order.id, status });
    if (status === 'READY') emitToRestaurant(req.user.restaurantId, 'kitchen:order-ready', { orderId: order.id });
    res.json({ order: updated });
  } catch (e) { next(e); }
});

export default router;
