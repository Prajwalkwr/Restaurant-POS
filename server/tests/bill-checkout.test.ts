import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { recalcBill } from '../src/services/billing.service.js';

describe('bill checkout rounding balance', () => {
  it('closes with a sub-NPR 1 balance without payment but rejects NPR 1 or more', async () => {
    const biller = await prisma.user.findUnique({ where: { email: 'biller@restaurant.local' } });
    expect(biller).not.toBeNull();
    if (!biller) throw new Error('Seeded biller account is required for this test');

    const menuItem = await prisma.menuItem.findFirst({
      where: { restaurantId: biller.restaurantId, available: true, soldOut: false },
    });
    expect(menuItem).not.toBeNull();
    if (!menuItem) throw new Error('An available menu item is required for this test');

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: 'biller@restaurant.local', password: 'Biller@123' });
    expect(login.status).toBe(200);

    const created: Array<{ tableId: string; sessionId: string; orderId: string; billId: string }> = [];

    try {
      for (const outstandingMinor of [99, 100]) {
        const table = await prisma.restaurantTable.create({
          data: {
            restaurantId: biller.restaurantId,
            number: `checkout-test-${Date.now()}-${outstandingMinor}`,
            capacity: 2,
            status: 'OCCUPIED',
          },
        });
        const session = await prisma.tableSession.create({
          data: { restaurantId: biller.restaurantId, tableId: table.id, waiterId: biller.id },
        });
        let orderNumber = await prisma.order.count({ where: { restaurantId: biller.restaurantId } }) + 1;
        while (await prisma.order.findFirst({
          where: { restaurantId: biller.restaurantId, orderNumber },
          select: { id: true },
        })) orderNumber += 1;
        const order = await prisma.order.create({
          data: {
            restaurantId: biller.restaurantId,
            tableSessionId: session.id,
            orderNumber,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            createdById: biller.id,
          },
        });
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: menuItem.id,
            itemName: menuItem.name,
            unitPriceMinor: Math.max(menuItem.priceMinor, 10_000),
            quantity: 1,
          },
        });
        let billNumber = await prisma.bill.count({ where: { restaurantId: biller.restaurantId } }) + 1;
        while (await prisma.bill.findFirst({
          where: { restaurantId: biller.restaurantId, billNumber },
          select: { id: true },
        })) billNumber += 1;
        const bill = await prisma.bill.create({
          data: { restaurantId: biller.restaurantId, tableSessionId: session.id, billNumber },
        });
        created.push({ tableId: table.id, sessionId: session.id, orderId: order.id, billId: bill.id });

        const calculatedBill = await recalcBill(bill.id);
        expect(calculatedBill).not.toBeNull();
        if (!calculatedBill) throw new Error('Bill calculation failed in checkout test');
        await prisma.bill.update({
          where: { id: bill.id },
          data: { amountPaidMinor: calculatedBill.grandTotalMinor - outstandingMinor },
        });

        const response = await agent.post(`/api/bills/${bill.id}/close`).send({});
        if (outstandingMinor === 99) {
          expect(response.status).toBe(200);
          const closedBill = await prisma.bill.findUnique({
            where: { id: bill.id },
            include: { receipt: true },
          });
          expect(closedBill?.status).toBe('PAID');
          expect(closedBill?.amountPaidMinor).toBe(calculatedBill.grandTotalMinor - 99);
          expect(closedBill?.outstandingMinor).toBe(0);
          expect(closedBill?.receipt?.snapshot).toMatchObject({ outstandingMinor: 0, status: 'PAID' });
          expect((await prisma.tableSession.findUnique({ where: { id: session.id } }))?.status).toBe('CLOSED');
          expect((await prisma.restaurantTable.findUnique({ where: { id: table.id } }))?.status).toBe('AVAILABLE');
          const audit = await prisma.auditLog.findFirst({
            where: { entityType: 'Bill', entityId: bill.id, action: 'BILL_CLOSED' },
          });
          expect(audit?.reason).toContain('rounding balance waived');
        } else {
          expect(response.status).toBe(400);
          expect(response.body.error).toContain('below NPR 1.00');
          expect(await prisma.receipt.findUnique({ where: { billId: bill.id } })).toBeNull();
          expect((await prisma.tableSession.findUnique({ where: { id: session.id } }))?.status).toBe('ACTIVE');
        }
      }

      const table = await prisma.restaurantTable.create({
        data: {
          restaurantId: biller.restaurantId,
          number: `discount-test-${Date.now()}`,
          capacity: 2,
          status: 'OCCUPIED',
        },
      });
      const session = await prisma.tableSession.create({
        data: { restaurantId: biller.restaurantId, tableId: table.id, waiterId: biller.id },
      });
      let orderNumber = await prisma.order.count({ where: { restaurantId: biller.restaurantId } }) + 1;
      while (await prisma.order.findFirst({
        where: { restaurantId: biller.restaurantId, orderNumber },
        select: { id: true },
      })) orderNumber += 1;
      const order = await prisma.order.create({
        data: {
          restaurantId: biller.restaurantId,
          tableSessionId: session.id,
          orderNumber,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          createdById: biller.id,
        },
      });
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: menuItem.id,
          itemName: menuItem.name,
          unitPriceMinor: Math.max(menuItem.priceMinor, 10_000),
          quantity: 1,
        },
      });
      let billNumber = await prisma.bill.count({ where: { restaurantId: biller.restaurantId } }) + 1;
      while (await prisma.bill.findFirst({
        where: { restaurantId: biller.restaurantId, billNumber },
        select: { id: true },
      })) billNumber += 1;
      const bill = await prisma.bill.create({
        data: { restaurantId: biller.restaurantId, tableSessionId: session.id, billNumber },
      });
      created.push({ tableId: table.id, sessionId: session.id, orderId: order.id, billId: bill.id });
      const beforeDiscount = await recalcBill(bill.id);
      expect(beforeDiscount).not.toBeNull();
      if (!beforeDiscount) throw new Error('Bill calculation failed in discount test');

      const applyDiscount = await agent.post(`/api/bills/${bill.id}/adjustments`)
        .send({ discountPercent: 10 });
      expect(applyDiscount.status).toBe(200);
      expect(applyDiscount.body.discountMinor).toBe(Math.round(beforeDiscount.subtotalMinor * 0.1));
      const discountedBill = await prisma.bill.findUnique({ where: { id: bill.id } });
      expect(discountedBill).not.toBeNull();
      if (!discountedBill) throw new Error('Discounted bill was not persisted');
      expect(discountedBill?.grandTotalMinor).toBeLessThan(beforeDiscount.grandTotalMinor);
      expect(discountedBill?.outstandingMinor).toBe(discountedBill?.grandTotalMinor);
      expect(discountedBill?.discountMinor).toBe(applyDiscount.body.discountMinor);
      expect(discountedBill?.grandTotalMinor).toBe(
        discountedBill.subtotalMinor
        - discountedBill.discountMinor
        + discountedBill.serviceChargeMinor
        + discountedBill.taxMinor,
      );

      const paymentAmountMinor = 100;
      const payment = await agent.post(`/api/bills/${bill.id}/payments`)
        .send({ method: 'CASH', amountMinor: paymentAmountMinor });
      expect(payment.status).toBe(201);
      const billAfterPayment = await prisma.bill.findUnique({ where: { id: bill.id } });
      expect(billAfterPayment?.amountPaidMinor).toBe(paymentAmountMinor);
      expect(billAfterPayment?.outstandingMinor).toBe(discountedBill.grandTotalMinor - paymentAmountMinor);

      const discountBelowPaidAmount = await agent.post(`/api/bills/${bill.id}/adjustments`)
        .send({ discountPercent: 100 });
      expect(discountBelowPaidAmount.status).toBe(400);
      expect(discountBelowPaidAmount.body.error).toContain('below the amount already paid');

      const resetDiscount = await agent.post(`/api/bills/${bill.id}/adjustments`)
        .send({ discountPercent: 0 });
      expect(resetDiscount.status).toBe(200);
      expect(resetDiscount.body.discountMinor).toBe(0);
      const billAfterReset = await prisma.bill.findUnique({ where: { id: bill.id } });
      expect(billAfterReset).not.toBeNull();
      if (!billAfterReset) throw new Error('Bill could not be loaded after resetting discount');
      expect(billAfterReset?.discountMinor).toBe(0);
      expect(billAfterReset.outstandingMinor).toBe(billAfterReset.grandTotalMinor - paymentAmountMinor);
    } finally {
      const billIds = created.map(({ billId }) => billId);
      const orderIds = created.map(({ orderId }) => orderId);
      const sessionIds = created.map(({ sessionId }) => sessionId);
      const tableIds = created.map(({ tableId }) => tableId);
      await prisma.auditLog.deleteMany({ where: { entityType: 'Bill', entityId: { in: billIds } } });
      await prisma.receipt.deleteMany({ where: { billId: { in: billIds } } });
      await prisma.payment.deleteMany({ where: { billId: { in: billIds } } });
      await prisma.bill.deleteMany({ where: { id: { in: billIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
      await prisma.restaurantTable.deleteMany({ where: { id: { in: tableIds } } });
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
