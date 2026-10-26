import { describe, expect, it } from 'vitest';
import { formatSalesCsv } from './reportCsv.js';

describe('formatSalesCsv', () => {
  it('exports completed bill data in the sales report layout using restaurant-local time', () => {
    const csv = formatSalesCsv({
      restaurantName: 'Himalaya Kitchen',
      currency: 'NPR',
      timeZone: 'Asia/Kathmandu',
      from: new Date('2026-09-30T18:15:00.000Z'),
      to: new Date('2026-10-07T18:14:59.000Z'),
      bills: [{
        billNumber: 41,
        subtotalMinor: 52_000,
        discountMinor: 2_000,
        taxMinor: 6_500,
        grandTotalMinor: 59_500,
        createdAt: new Date('2026-10-01T06:00:00.000Z'),
        finalizedAt: new Date('2026-10-01T06:29:00.000Z'),
        closedAt: null,
        tableSession: {
          table: { number: 'T04' },
          orders: [
            {
              orderNumber: 1041,
              items: [{ itemName: 'Chicken Momo', quantity: 2 }],
            },
            { orderNumber: 1042, items: [{ itemName: 'Masala Tea', quantity: 1 }] },
          ],
        },
        payments: [
          { method: 'CASH', amountMinor: 30_000 },
          { method: 'CASH', amountMinor: 29_500 },
          { method: 'ESEWA', amountMinor: 0 },
        ],
      }],
    });

    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('"RESTAURANT SALES REPORT"');
    expect(rows[1]).toContain('Himalaya Kitchen | Reporting period: 2026-10-01 to 2026-10-07 | Currency: NPR');
    expect(rows[3]).toBe('"Order ID","Date","Time","Table","Order Type","Items","Subtotal (NPR)","Tax (NPR)","Total (NPR)","Payment Method"');
    expect(rows[4]).toBe('"ORD-1041, ORD-1042","2026-10-01","12:14","T04","Dine-in","Chicken Momo x 2; Masala Tea x 1","500.00","65.00","595.00","Cash, eSewa"');
  });

  it('quotes CSV content and prevents spreadsheet formulas from being evaluated', () => {
    const csv = formatSalesCsv({
      restaurantName: '=HYPERLINK("https://example.com")',
      currency: 'NPR',
      timeZone: 'Asia/Kathmandu',
      from: new Date('2026-09-30T18:15:00.000Z'),
      to: new Date('2026-09-30T18:15:00.000Z'),
      bills: [],
    });

    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"") | Reporting period:`);
  });
});
