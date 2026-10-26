interface SalesExportBill {
  billNumber: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
  createdAt: Date;
  finalizedAt: Date | null;
  closedAt: Date | null;
  tableSession: {
    table: { number: string };
    orders: Array<{
      orderNumber: number;
      items: Array<{ itemName: string; quantity: number }>;
    }>;
  };
  payments: Array<{ method: string; amountMinor: number }>;
}

interface SalesCsvOptions {
  restaurantName: string;
  currency: string;
  timeZone: string;
  from: Date;
  to: Date;
  bills: SalesExportBill[];
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function formatDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.hour}:${values.minute}`;
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    ESEWA: 'eSewa',
    KHALTI: 'Khalti',
    BANK_TRANSFER: 'Bank Transfer',
    OTHER: 'Other',
  };
  return labels[method] ?? method;
}

function money(minor: number) {
  return (minor / 100).toFixed(2);
}

export function formatSalesCsv({ restaurantName, currency, timeZone, from, to, bills }: SalesCsvOptions) {
  const rows: Array<Array<string | number>> = [
    ['RESTAURANT SALES REPORT'],
    [`${restaurantName} | Reporting period: ${formatDate(from, timeZone)} to ${formatDate(to, timeZone)} | Currency: ${currency}`],
    [],
    [
      'Order ID',
      'Date',
      'Time',
      'Table',
      'Order Type',
      'Items',
      `Subtotal (${currency})`,
      `Tax (${currency})`,
      `Total (${currency})`,
      'Payment Method',
    ],
  ];

  for (const bill of bills) {
    const transactionDate = bill.finalizedAt ?? bill.closedAt ?? bill.createdAt;
    const orderIds = bill.tableSession.orders.map((order) => `ORD-${order.orderNumber}`);
    const items = bill.tableSession.orders.flatMap((order) => order.items)
      .map((item) => `${item.itemName} x ${item.quantity}`);
    const paymentMethods = Array.from(new Set(bill.payments.map(({ method }) => paymentMethodLabel(method))));

    rows.push([
      orderIds.length > 0 ? orderIds.join(', ') : `BILL-${bill.billNumber}`,
      formatDate(transactionDate, timeZone),
      formatTime(transactionDate, timeZone),
      bill.tableSession.table.number,
      'Dine-in',
      items.join('; '),
      money(bill.subtotalMinor - bill.discountMinor),
      money(bill.taxMinor),
      money(bill.grandTotalMinor),
      paymentMethods.length > 0 ? paymentMethods.join(', ') : 'Not recorded',
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
