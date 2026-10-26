import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('waiter order item changes', () => {
  it('allows draft changes and enforces the five-minute submitted-order edit window', async () => {
    const waiter = await prisma.user.findUnique({ where: { email: 'waiterA@restaurant.local' } });
    expect(waiter).not.toBeNull();
    if (!waiter) throw new Error('Seeded waiter account is required for this test');

    const table = await prisma.restaurantTable.findFirst({ where: { restaurantId: waiter.restaurantId } });
    const menuItem = await prisma.menuItem.findFirst({
      where: { restaurantId: waiter.restaurantId, available: true, soldOut: false },
    });
    expect(table).not.toBeNull();
    expect(menuItem).not.toBeNull();
    if (!table || !menuItem) throw new Error('Seeded table and available menu item are required for this test');

    const session = await prisma.tableSession.create({
      data: { restaurantId: waiter.restaurantId, tableId: table.id, waiterId: waiter.id },
    });
    let orderId: string | undefined;
    const itemIds: string[] = [];

    try {
      let orderNumber = await prisma.order.count({ where: { restaurantId: waiter.restaurantId } }) + 1;
      while (await prisma.order.findFirst({
        where: { restaurantId: waiter.restaurantId, orderNumber },
        select: { id: true },
      })) orderNumber += 1;

      const order = await prisma.order.create({
        data: {
          restaurantId: waiter.restaurantId,
          tableSessionId: session.id,
          orderNumber,
          createdById: waiter.id,
        },
      });
      orderId = order.id;

      const item = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: menuItem.id,
          itemName: menuItem.name,
          unitPriceMinor: menuItem.priceMinor,
          quantity: 2,
          notes: 'No onion',
        },
      });
      itemIds.push(item.id);

      const agent = request.agent(app);
      const login = await agent.post('/api/auth/login')
        .send({ email: 'waiterA@restaurant.local', password: 'Waiter@123' });
      expect(login.status).toBe(200);

      const addedItem = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1 });
      expect(addedItem.status).toBe(201);
      expect(addedItem.body.item.id).not.toBe(item.id);
      expect(addedItem.body.item.quantity).toBe(1);
      itemIds.push(addedItem.body.item.id);

      const duplicatePlainItem = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1 });
      expect(duplicatePlainItem.status).toBe(201);
      expect(duplicatePlainItem.body.item.id).toBe(addedItem.body.item.id);
      expect(duplicatePlainItem.body.item.quantity).toBe(2);

      const duplicateCustomizedItem = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1, notes: 'No onion' });
      expect(duplicateCustomizedItem.status).toBe(201);
      expect(duplicateCustomizedItem.body.item.id).toBe(item.id);
      expect(duplicateCustomizedItem.body.item.quantity).toBe(3);

      const reduceWithoutReason = await agent.patch(`/api/orders/${order.id}/items/${item.id}`)
        .send({ quantity: 1 });
      expect(reduceWithoutReason.status).toBe(200);
      expect(reduceWithoutReason.body.item.quantity).toBe(1);

      const removeWithoutReason = await agent.patch(`/api/orders/${order.id}/items/${item.id}`)
        .send({ quantity: 0 });
      expect(removeWithoutReason.status).toBe(200);
      expect(removeWithoutReason.body.item.status).toBe('CANCELLED');

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      const addDuringEditWindow = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1 });
      expect(addDuringEditWindow.status).toBe(201);
      itemIds.push(addDuringEditWindow.body.item.id);
      await prisma.orderItem.update({
        where: { id: addDuringEditWindow.body.item.id },
        data: { quantity: 1_000_000 },
      });
      const popularMenu = await agent.get('/api/menu/items?sort=popular');
      expect(popularMenu.status).toBe(200);
      expect(popularMenu.body.items[0].id).toBe(menuItem.id);
      expect(popularMenu.body.items[0].soldQuantity).toBeGreaterThanOrEqual(1_000_000);

      const updateDuringEditWindow = await agent.patch(`/api/orders/${order.id}/items/${addedItem.body.item.id}`)
        .send({ quantity: 2 });
      expect(updateDuringEditWindow.status).toBe(200);
      expect(updateDuringEditWindow.body.item.quantity).toBe(2);
      const removeDuringEditWindow = await agent.post(`/api/orders/${order.id}/items/${addDuringEditWindow.body.item.id}/cancel`)
        .send({});
      expect(removeDuringEditWindow.status).toBe(200);

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PREPARING', submittedAt: new Date() },
      });
      const addAfterPreparationStarts = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1 });
      expect(addAfterPreparationStarts.status).toBe(403);
      const updateAfterPreparationStarts = await agent.patch(`/api/orders/${order.id}/items/${addedItem.body.item.id}`)
        .send({ quantity: 3 });
      expect(updateAfterPreparationStarts.status).toBe(403);
      const removeAfterPreparationStarts = await agent.post(`/api/orders/${order.id}/items/${addedItem.body.item.id}/cancel`)
        .send({});
      expect(removeAfterPreparationStarts.status).toBe(403);

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'SUBMITTED', submittedAt: new Date(Date.now() - 5 * 60 * 1000 - 1000) },
      });
      const addAfterEditWindow = await agent.post(`/api/orders/${order.id}/items`)
        .send({ menuItemId: menuItem.id, quantity: 1 });
      expect(addAfterEditWindow.status).toBe(403);
      const updateAfterEditWindow = await agent.patch(`/api/orders/${order.id}/items/${addedItem.body.item.id}`)
        .send({ quantity: 3 });
      expect(updateAfterEditWindow.status).toBe(403);
      const removeAfterEditWindow = await agent.post(`/api/orders/${order.id}/items/${addedItem.body.item.id}/cancel`)
        .send({});
      expect(removeAfterEditWindow.status).toBe(403);

      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
        const kitchenUpdate = await agent.patch(`/api/kitchen/orders/${order.id}/status`).send({ status });
        expect(kitchenUpdate.status).toBe(200);
        const tables = await agent.get('/api/tables');
        expect(tables.status).toBe(200);
        const updatedTable = tables.body.tables.find((entry: { id: string }) => entry.id === table.id);
        const displayedOrder = updatedTable?.activeSession?.orders.find((entry: { id: string }) => entry.id === order.id);
        expect(displayedOrder?.status).toBe(status);
      }

      const auditLogs = await prisma.auditLog.findMany({
        where: { entityType: 'OrderItem', entityId: { in: itemIds } },
      });
      expect(auditLogs.some((entry) => entry.action === 'ORDER_ITEM_ADDED')).toBe(true);
      expect(auditLogs.some((entry) => entry.action === 'ORDER_ITEM_UPDATED')).toBe(true);
      expect(auditLogs.some((entry) => entry.action === 'ORDER_ITEM_CANCELLED')).toBe(true);
    } finally {
      await prisma.auditLog.deleteMany({
        where: { entityType: 'OrderItem', entityId: { in: itemIds } },
      });
      if (orderId) {
        await prisma.orderItem.deleteMany({ where: { orderId } });
        await prisma.order.delete({ where: { id: orderId } });
      }
      await prisma.tableSession.delete({ where: { id: session.id } });
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
