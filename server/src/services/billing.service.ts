import { prisma } from '../lib/prisma.js';

export async function recalcBill(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { tableSession: { include: { orders: { include: { items: true } } } }, restaurant: true },
  });
  if (!bill) throw new Error('Bill not found');

  let subtotal = 0;
  for (const order of bill.tableSession.orders) {
    if (order.status === 'CANCELLED') continue;
    for (const item of order.items) {
      if (item.status === 'CANCELLED') continue;
      subtotal += item.unitPriceMinor * item.quantity;
    }
  }

  const discountMinor = Math.min(Math.max(bill.discountMinor || 0, 0), subtotal);
  const discountedSubtotal = subtotal - discountMinor;

  // Service charge on discounted subtotal
  const serviceMinor = Math.round(discountedSubtotal * bill.restaurant.serviceChargeBps / 10000);

  // VAT on (discounted subtotal + service charge)
  const taxableBase = discountedSubtotal + serviceMinor;
  const taxMinor = Math.round(taxableBase * bill.restaurant.taxRateBps / 10000);

  const grandTotal = discountedSubtotal + serviceMinor + taxMinor;
  const outstanding = grandTotal - bill.amountPaidMinor;

  const status =
    outstanding <= 0 && bill.amountPaidMinor >= grandTotal && grandTotal > 0
      ? 'PAID'
      : bill.amountPaidMinor > 0
      ? 'PARTIALLY_PAID'
      : 'OPEN';

  await prisma.bill.update({
    where: { id: billId },
    data: {
      subtotalMinor: subtotal,
      discountMinor,
      taxMinor,
      serviceChargeMinor: serviceMinor,
      grandTotalMinor: grandTotal,
      outstandingMinor: outstanding < 0 ? 0 : outstanding,
      status: bill.status === 'CLOSED' || bill.status === 'VOIDED' ? bill.status : (status as any),
    },
  });

  return prisma.bill.findUnique({ where: { id: billId } });
}

export function computeChange(tenderedMinor: number, dueMinor: number): number {
  return tenderedMinor - dueMinor;
}
