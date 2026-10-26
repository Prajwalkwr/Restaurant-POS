import { useEffect, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  FileText,
  LoaderCircle,
  Printer,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { get, post } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { getMenuImageUrl } from '../../lib/menuImages';
import { getOrderItemCustomizations } from '../../lib/orderItemCustomizations';

const money = (minor = 0) => `Rs ${new Intl.NumberFormat('en-NP', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(minor / 100)}`;

const checkoutRoundingToleranceMinor = 100;

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error || 'The request could not be completed. Please try again.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed. Please try again.';
};

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] ?? character);

interface BillItem {
  id: string;
  itemName: string;
  quantity: number;
  unitPriceMinor: number;
  originalUnitPriceMinor?: number | null;
  itemDiscountPercent?: number | null;
  status: string;
  modifiers?: unknown;
  notes?: string | null;
  menuItem?: { imageUrl?: string | null } | null;
}

interface Bill {
  id: string;
  billNumber: number;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  grandTotalMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
  receipt?: { receiptNumber: string } | null;
  tableSession?: {
    customerName?: string | null;
    openedAt: string;
    table?: { number: string };
    waiter?: { name: string };
    orders?: { orderNumber: number; status: string; items?: BillItem[] }[];
  };
  payments?: {
    id: string;
    method: string;
    amountMinor: number;
    status: string;
    createdAt: string;
    recordedBy?: { name: string };
  }[];
}

const paymentMethods = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CARD', label: 'Card', icon: CreditCard },
  { value: 'ESEWA', label: 'eSewa', icon: Wallet },
  { value: 'KHALTI', label: 'Khalti', icon: Wallet },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: CreditCard },
  { value: 'OTHER', label: 'Other', icon: FileText },
];

export default function BillerBill() {
  const { billId } = useParams();
  const location = useLocation();
  const nav = useNavigate();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const billerPath = returnTo?.startsWith('/biller?') ? returnTo : '/biller';
  const qc = useQueryClient();
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [splitWays, setSplitWays] = useState('2');
  const [actionError, setActionError] = useState('');

  const { data, error, isError, isLoading, refetch: refetchBill } = useQuery<{ bill: Bill }>({
    queryKey: ['bill', billId],
    queryFn: () => get(`/bills/${billId}`),
    enabled: Boolean(billId),
  });

  useEffect(() => {
    const socket = getSocket();
    const refreshBill = () => { void refetchBill(); };
    socket.on('bill:updated', refreshBill);
    socket.on('bill:payment-recorded', refreshBill);
    socket.on('bill:closed', refreshBill);
    socket.on('order:items-updated', refreshBill);
    socket.on('order:item-cancelled', refreshBill);
    socket.on('order:status-changed', refreshBill);
    return () => {
      socket.off('bill:updated', refreshBill);
      socket.off('bill:payment-recorded', refreshBill);
      socket.off('bill:closed', refreshBill);
      socket.off('order:items-updated', refreshBill);
      socket.off('order:item-cancelled', refreshBill);
      socket.off('order:status-changed', refreshBill);
    };
  }, [refetchBill]);

  const discountMutation = useMutation({
    mutationFn: (discountPercentValue: number) => post<{ discountMinor: number }>(
      `/bills/${billId}/adjustments`,
      { discountPercent: discountPercentValue },
    ),
    onSuccess: async () => {
      setActionError('');
      const result = await refetchBill();
      const updatedBill = result.data?.bill;
      if (updatedBill && amount) {
        const enteredAmountMinor = Math.round(Number(amount) * 100);
        if (Number.isFinite(enteredAmountMinor) && enteredAmountMinor > updatedBill.outstandingMinor) {
          setAmount(updatedBill.outstandingMinor > 0 ? (updatedBill.outstandingMinor / 100).toFixed(2) : '');
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['bills'] }),
        qc.invalidateQueries({ queryKey: ['active-sessions'] }),
      ]);
    },
    onError: (error: unknown) => {
      setActionError(getErrorMessage(error));
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (payment: { method: string; amountMinor: number; tenderedMinor?: number }) => post(
      `/bills/${billId}/payments`,
      { ...payment, idempotencyKey: `pay-${crypto.randomUUID()}` },
    ),
    onSuccess: async () => {
      setActionError('');
      setAmount('');
      await Promise.all([
        refetchBill(),
        qc.invalidateQueries({ queryKey: ['bills'] }),
        qc.invalidateQueries({ queryKey: ['active-sessions'] }),
      ]);
    },
    onError: (error: unknown) => {
      setActionError(getErrorMessage(error));
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => post(`/bills/${billId}/close`),
    onSuccess: async () => {
      setActionError('');
      await Promise.all([
        refetchBill(),
        qc.invalidateQueries({ queryKey: ['bills'] }),
        qc.invalidateQueries({ queryKey: ['active-sessions'] }),
      ]);
    },
    onError: (error: unknown) => {
      setActionError(getErrorMessage(error));
    },
  });

  const bill = data?.bill;

  useEffect(() => {
    if (!bill) return;
    const percentage = bill.subtotalMinor > 0 ? bill.discountMinor / bill.subtotalMinor * 100 : 0;
    setDiscountPercent(Number(percentage.toFixed(2)).toString());
  }, [bill?.id]);

  const applyDiscount = () => {
    setActionError('');
    const percentage = Number(discountPercent);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setActionError('Enter a discount percentage from 0 to 100.');
      return;
    }
    discountMutation.mutate(percentage);
  };

  const recordPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    const amountMinor = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setActionError('Enter a payment amount greater than zero.');
      return;
    }
    if (amountMinor > (bill?.outstandingMinor ?? 0)) {
      setActionError('Payment cannot exceed the outstanding balance.');
      return;
    }
    paymentMutation.mutate({ method, amountMinor });
  };

  const printReceipt = async () => {
    setActionError('');
    try {
      const response = await get<{ bill: Bill & { restaurant?: { name?: string; address?: string; phone?: string; panNumber?: string; taxRegistrationNumber?: string; receiptFooter?: string } } }>(`/bills/${billId}/receipt`);
      const receipt = response.bill;
      const printWindow = window.open('', '_blank', 'width=420,height=700');
      if (!printWindow) {
        setActionError('The receipt window was blocked. Allow pop-ups to print the receipt.');
        return;
      }
      const items = (receipt.tableSession?.orders ?? [])
        .flatMap((order) => order.items ?? [])
        .filter((item) => item.status !== 'CANCELLED');
      const itemLines = items.map((item) => `
        <tr>
          <td>${item.quantity} × ${escapeHtml(item.itemName)}${item.itemDiscountPercent ? `<br><small>${item.itemDiscountPercent}% item discount · before discount ${money((item.originalUnitPriceMinor ?? item.unitPriceMinor) * item.quantity)}</small>` : ''}</td>
          <td class="right">${money(item.unitPriceMinor * item.quantity)}</td>
        </tr>
      `).join('');
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${receipt.billNumber}</title>
        <style>
          body{font:14px ui-monospace,monospace;max-width:360px;margin:24px auto;padding:0 16px;color:#263b33}
          h1{text-align:center;font:600 22px Georgia,serif;margin-bottom:4px}
          p{text-align:center;font-size:12px;color:#596d62;margin:4px 0}
          hr{border:0;border-top:1px dashed #9aa99f;margin:16px 0}
          table{width:100%;border-collapse:collapse}td{padding:5px 0;vertical-align:top}.right{text-align:right;white-space:nowrap}
          .total{font-size:16px;font-weight:700}.footer{text-align:center;margin-top:18px}
        </style></head><body>
        <h1>${escapeHtml(receipt.restaurant?.name || 'Restaurant')}</h1>
        <p>${escapeHtml(receipt.restaurant?.address || '')}</p>
        <p>${escapeHtml(receipt.restaurant?.phone || '')}</p>
        <p>PAN: ${escapeHtml(receipt.restaurant?.panNumber || '-')} · VAT: ${escapeHtml(receipt.restaurant?.taxRegistrationNumber || '-')}</p>
        <hr><p>Bill #${receipt.billNumber} · Table ${escapeHtml(receipt.tableSession?.table?.number || '-')}</p>
        <p>${new Date().toLocaleString()} · ${escapeHtml(receipt.tableSession?.waiter?.name || '')}</p><hr>
        <table>${itemLines}</table><hr>
        <table>
          <tr><td>Subtotal</td><td class="right">${money(receipt.subtotalMinor)}</td></tr>
          <tr><td>Discount</td><td class="right">−${money(receipt.discountMinor)}</td></tr>
          <tr><td>Service charge</td><td class="right">${money(receipt.serviceChargeMinor)}</td></tr>
          <tr><td>Tax</td><td class="right">${money(receipt.taxMinor)}</td></tr>
          <tr class="total"><td>Total</td><td class="right">${money(receipt.grandTotalMinor)}</td></tr>
          <tr><td>Paid</td><td class="right">${money(receipt.amountPaidMinor)}</td></tr>
          <tr><td>Outstanding</td><td class="right">${money(receipt.outstandingMinor)}</td></tr>
        </table><hr><p class="footer">${escapeHtml(receipt.restaurant?.receiptFooter || 'Thank you for dining with us!')}</p>
        </body></html>`);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#f2f7f4] p-6 sm:p-10">
        <div className="mx-auto max-w-5xl animate-pulse space-y-5" aria-label="Loading bill">
          <div className="h-10 w-64 rounded-xl bg-white" />
          <div className="h-40 rounded-3xl bg-white" />
          <div className="h-72 rounded-3xl bg-white" />
        </div>
      </main>
    );
  }

  if (isError || !bill) {
    return (
      <main className="min-h-screen bg-[#f2f7f4] p-6 sm:p-10">
        <div className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-7">
          <div className="flex items-start gap-3 text-rose-800">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h1 className="font-semibold">Could not load this bill</h1>
              <p className="mt-1 text-sm">{getErrorMessage(error)}</p>
            </div>
          </div>
          <button onClick={() => nav(billerPath)} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#168263] px-4 py-2 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4" /> Back to billing desk
          </button>
        </div>
      </main>
    );
  }

  const items = (bill.tableSession?.orders ?? [])
    .flatMap((order) => (order.items ?? []).map((item) => ({ ...item, orderNumber: order.orderNumber })));
  const splitCount = Number(splitWays);
  const isValidSplitCount = Number.isInteger(splitCount)
    && splitCount >= 2
    && splitCount <= 20
    && splitCount <= bill.outstandingMinor;
  const splitBaseMinor = isValidSplitCount ? Math.floor(bill.outstandingMinor / splitCount) : 0;
  const largerShareCount = isValidSplitCount ? bill.outstandingMinor % splitCount : 0;
  const firstSplitAmount = ((splitBaseMinor + (largerShareCount > 0 ? 1 : 0)) / 100).toFixed(2);
  const isClosed = bill.status === 'CLOSED' || bill.status === 'VOIDED';
  const canCollect = !isClosed && bill.outstandingMinor > 0;
  const hasRoundingBalance = bill.outstandingMinor > 0
    && bill.outstandingMinor < checkoutRoundingToleranceMinor;

  return (
    <main className="min-h-screen bg-[#f2f7f4] text-[#263b33]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={() => nav(billerPath)}
              className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-[#dce8e1] bg-white text-[#52635b] transition-colors hover:bg-[#f8fbf9]"
              aria-label="Back to billing desk"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#438268]">Billing desk · Table {bill.tableSession?.table?.number ?? '—'}</p>
              <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-[#203a30] sm:text-4xl">Bill #{bill.billNumber}</h1>
              <p className="mt-1 text-sm text-[#78877f]">{bill.tableSession?.customerName || 'Guest'} · {bill.tableSession?.waiter?.name || 'Waiter not assigned'}</p>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${
            bill.status === 'OPEN' ? 'bg-amber-50 text-amber-800 ring-amber-200' :
            bill.status === 'PARTIALLY_PAID' ? 'bg-orange-50 text-orange-800 ring-orange-200' :
            bill.status === 'VOIDED' ? 'bg-rose-50 text-rose-800 ring-rose-200' :
            'bg-emerald-50 text-emerald-800 ring-emerald-200'
          }`}>
            {bill.status.replace('_', ' ')}
          </span>
        </header>

        {actionError && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-rose-800">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{actionError}</p>
          </div>
        )}
        <section aria-label="Bill totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Bill total', value: money(bill.grandTotalMinor), icon: ReceiptText },
            { label: 'Paid so far', value: money(bill.amountPaidMinor), icon: CheckCircle2 },
            { label: 'Amount due', value: money(bill.outstandingMinor), icon: Wallet },
          ].map((summary) => {
            const Icon = summary.icon;
            return (
              <article key={summary.label} className="rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#74837b]">{summary.label}</p>
                  <Icon className="h-5 w-5 text-[#5e8873]" />
                </div>
                <p className="mt-3 font-serif text-3xl font-semibold tracking-tight text-[#203a30]">{summary.value}</p>
              </article>
            );
          })}
        </section>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="overflow-hidden rounded-3xl border border-[#dce8e1] bg-white shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
            <div className="border-b border-[#edf2ef] px-5 py-5 sm:px-6">
              <h2 className="font-serif text-xl font-semibold text-[#294338]">Order summary</h2>
              <p className="mt-1 text-sm text-[#849188]">{items.length} items across {bill.tableSession?.orders?.length ?? 0} orders</p>
            </div>
            {items.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-[#849188]">There are no items on this bill yet.</p>
            ) : (
              <div className="divide-y divide-[#edf2ef]">
                {items.map((item) => (
                  <div key={item.id} className={`flex items-center justify-between gap-4 px-5 py-4 sm:px-6 ${item.status === 'CANCELLED' ? 'text-[#9ba69f]' : ''}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      {getMenuImageUrl(item.itemName, item.menuItem?.imageUrl) && <img src={getMenuImageUrl(item.itemName, item.menuItem?.imageUrl)!} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0">
                        <p className={`font-medium ${item.status === 'CANCELLED' ? 'line-through' : 'text-[#40564b]'}`}>
                          {item.quantity} × {item.itemName}
                        </p>
                        <p className="mt-1 text-xs text-[#98a39d]">
                          Order #{item.orderNumber} · {money(item.unitPriceMinor)} each
                          {item.itemDiscountPercent ? ` · ${item.itemDiscountPercent}% item discount (was ${money(item.originalUnitPriceMinor ?? item.unitPriceMinor)})` : ''}
                        </p>
                        {getOrderItemCustomizations(item.modifiers, item.notes).map((detail) => (
                          <p key={detail} className="mt-1 text-xs text-[#78877f]">{detail}</p>
                        ))}
                      </div>
                    </div>
                    <p className="shrink-0 font-semibold text-[#294338]">{money(item.unitPriceMinor * item.quantity)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 border-t border-[#edf2ef] bg-[#fbfdfb] px-5 py-5 text-sm sm:px-6">
              <div className="flex justify-between text-[#718178]"><span>Subtotal</span><span>{money(bill.subtotalMinor)}</span></div>
              {bill.discountMinor > 0 && <div className="flex justify-between text-[#718178]"><span>Discount</span><span>−{money(bill.discountMinor)}</span></div>}
              {bill.discountMinor > 0 && (
                <div className="flex justify-between text-[#718178]">
                  <span>Subtotal after discount</span>
                  <span>{money(Math.max(0, bill.subtotalMinor - bill.discountMinor))}</span>
                </div>
              )}
              <div className="flex justify-between text-[#718178]"><span>Service charge</span><span>{money(bill.serviceChargeMinor)}</span></div>
              <div className="flex justify-between text-[#718178]"><span>Tax</span><span>{money(bill.taxMinor)}</span></div>
              <div className="flex justify-between border-t border-[#e5ece8] pt-3 text-base font-semibold text-[#294338]"><span>Total</span><span>{money(bill.grandTotalMinor)}</span></div>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e4f2eb] text-[#317757]"><CreditCard className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-serif text-xl font-semibold text-[#294338]">Collect payment</h2>
                  <p className="text-sm text-[#849188]">Balance due {money(bill.outstandingMinor)}</p>
                  {hasRoundingBalance && (
                    <p className="mt-1 text-xs text-[#668275]">
                      Balances under NPR 1.00 may be waived at checkout; no additional payment is required.
                    </p>
                  )}
                </div>
              </div>
              <form onSubmit={recordPayment} className="mt-5 space-y-4">
                <fieldset disabled={!canCollect || paymentMutation.isPending}>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#819087]">Payment method</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentMethods.map((paymentMethod) => {
                      const Icon = paymentMethod.icon;
                      return (
                        <button
                          key={paymentMethod.value}
                          type="button"
                          onClick={() => setMethod(paymentMethod.value)}
                          aria-pressed={method === paymentMethod.value}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold transition-colors ${
                            method === paymentMethod.value
                              ? 'border-[#8dbba3] bg-[#eaf5ee] text-[#205943]'
                              : 'border-[#e5ece8] bg-white text-[#75877d] hover:bg-[#f8fbf9]'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {paymentMethod.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="rounded-xl border border-[#e5ece8] bg-[#fbfdfb] p-3">
                  <label htmlFor="discount-percent" className="block text-sm font-medium text-[#52635b]">
                    Discount (%)
                    <span className="ml-1 text-xs font-normal text-[#849188]">Optional · defaults to 0%</span>
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="discount-percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={discountPercent}
                      onChange={(event) => setDiscountPercent(event.target.value)}
                      disabled={!canCollect || discountMutation.isPending || paymentMutation.isPending}
                      aria-label="Discount percentage"
                      className="w-full rounded-xl border border-[#dce8e1] bg-white px-3 py-2.5 text-[#31483c] outline-none focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8] disabled:bg-[#f2f7f4]"
                    />
                    <button
                      type="button"
                      onClick={applyDiscount}
                      disabled={!canCollect || discountMutation.isPending || paymentMutation.isPending}
                      className="shrink-0 rounded-xl border border-[#dce8e1] bg-white px-4 py-2 text-xs font-semibold text-[#267b67] hover:bg-[#f4f8f5] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {discountMutation.isPending ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                  {bill.discountMinor > 0 && (
                    <p className="mt-1.5 text-xs text-[#668275]">
                      Current discount: {money(bill.discountMinor)} ({discountPercent}%)
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-[#52635b]">
                    Amount (NPR)
                    <input
                      type="number"
                      min="0.01"
                      max={(bill.outstandingMinor / 100).toFixed(2)}
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      disabled={!canCollect || paymentMutation.isPending}
                      required
                      className="mt-1.5 w-full rounded-xl border border-[#dce8e1] bg-[#fbfdfb] px-3 py-2.5 text-[#31483c] outline-none focus:border-[#8dbba3] focus:ring-2 focus:ring-[#dff1e8] disabled:bg-[#f2f7f4]"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={!canCollect || paymentMutation.isPending || !amount}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#168263] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#126b52] disabled:cursor-not-allowed disabled:bg-[#a7b9af]"
                >
                  {paymentMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {paymentMutation.isPending ? 'Recording payment…' : canCollect ? 'Payment received' : 'No payment due'}
                </button>
                {!canCollect && !isClosed && <p className="text-center text-xs text-[#668275]">This bill is fully paid.</p>}
                {isClosed && <p className="text-center text-xs text-[#849188]">This bill is closed and can no longer accept payments.</p>}
              </form>
            </section>

            {canCollect && (
              <section className="rounded-3xl border border-[#dce8e1] bg-white p-5 shadow-[0_3px_10px_rgba(34,65,49,0.04)] sm:p-6">
                <h2 className="font-serif text-lg font-semibold text-[#294338]">Split payment</h2>
                <p className="mt-1 text-sm text-[#849188]">Divide the remaining balance equally.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label htmlFor="split-ways" className="text-sm font-medium text-[#52635b]">Number of people</label>
                  <input
                    id="split-ways"
                    type="number"
                    min={2}
                    max={20}
                    value={splitWays}
                    onChange={(event) => setSplitWays(event.target.value)}
                    className="w-20 rounded-lg border border-[#dce8e1] bg-[#fbfdfb] px-2 py-1.5 text-sm text-[#31483c] outline-none focus:border-[#8dbba3]"
                  />
                  {isValidSplitCount ? (
                    <span className="text-sm text-[#718178]">
                      {largerShareCount > 0
                        ? `${largerShareCount} share${largerShareCount === 1 ? '' : 's'} of ${money(splitBaseMinor + 1)} and ${splitCount - largerShareCount} of ${money(splitBaseMinor)}`
                        : `${money(splitBaseMinor)} each`}
                    </span>
                  ) : (
                    <span className="text-sm text-[#718178]">Choose 2–20 people, with at least 1 paisa per share.</span>
                  )}
                  <button
                    onClick={() => setAmount(firstSplitAmount)}
                    disabled={!isValidSplitCount}
                    className="rounded-full border border-[#dce8e1] px-3 py-1.5 text-xs font-semibold text-[#537162] transition-colors hover:bg-[#f4f8f5] disabled:opacity-50"
                  >
                    Use first share
                  </button>
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded-3xl border border-[#dce8e1] bg-white shadow-[0_3px_10px_rgba(34,65,49,0.04)]">
              <div className="border-b border-[#edf2ef] px-5 py-4 sm:px-6">
                <h2 className="font-serif text-lg font-semibold text-[#294338]">Payment history</h2>
              </div>
              {bill.payments?.length ? (
                <div className="divide-y divide-[#edf2ef]">
                  {bill.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6">
                      <div>
                        <p className="text-sm font-semibold text-[#40564b]">{payment.method.replace('_', ' ')}</p>
                        <p className="mt-1 text-xs text-[#98a39d]">{new Date(payment.createdAt).toLocaleString()} · {payment.recordedBy?.name || 'Biller'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#294338]">{money(payment.amountMinor)}</p>
                        <p className="text-xs text-[#668275]">{payment.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-6 py-7 text-center text-sm text-[#849188]">No payments recorded yet.</p>
              )}
            </section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={() => closeMutation.mutate()}
                disabled={bill.outstandingMinor >= checkoutRoundingToleranceMinor || isClosed || Boolean(bill.receipt) || closeMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#168263] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#126b52] disabled:cursor-not-allowed disabled:bg-[#a7b9af]"
              >
                {closeMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {closeMutation.isPending
                  ? 'Generating bill…'
                  : isClosed
                    ? 'Bill closed · table available'
                    : bill.receipt
                      ? 'Bill generated'
                      : hasRoundingBalance
                        ? 'Waive balance & close bill'
                        : 'Generate bill & free table'}
              </button>
              <button
                onClick={() => void printReceipt()}
                disabled={!bill.receipt}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#dce8e1] bg-white px-4 py-3 text-sm font-semibold text-[#40564b] transition-colors hover:bg-[#f8fbf9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" /> Print receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
