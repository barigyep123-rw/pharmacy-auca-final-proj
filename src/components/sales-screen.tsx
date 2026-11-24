"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatRwf, formatWhen } from "@/lib/format";
import { kigaliToday } from "@/lib/time";
import type { Drug, PaymentReceipt, Sale } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Tender = { id: number; name: string; settlesImmediately: boolean };

function slipFromSale(sale: Sale): PaymentReceipt {
  return {
    numbers: sale.receiptNumber ? [sale.receiptNumber] : [],
    issuedAt: sale.createdAt,
    customerName: sale.customerName,
    sellerName: sale.sellerName,
    paymentMethodName: sale.paymentMethodName,
    settlesImmediately: sale.settlesImmediately,
    lines: [
      {
        name: sale.drugName,
        strength: sale.strength,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        total: sale.total,
      },
    ],
  };
}

function party(sale: Sale) {
  if (sale.prescriptionId) return `Prescription #${sale.prescriptionId}`;
  return sale.customerName || "Walk-in";
}

export function SalesScreen() {
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drugId, setDrugId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [methods, setMethods] = useState<Tender[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  async function load() {
    const [drugResult, saleResult, methodResult] = await Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ sales: Sale[] }>("/api/sales"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ]);
    setDrugs(drugResult.drugs);
    setSales(saleResult.sales);
    setMethods(methodResult.methods);
    setPaymentMethodId((current) => current ?? methodResult.methods[0]?.id ?? null);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ sales: Sale[] }>("/api/sales"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ])
      .then(([drugResult, saleResult, methodResult]) => {
        if (cancel) return;
        setDrugs(drugResult.drugs);
        setSales(saleResult.sales);
        setMethods(methodResult.methods);
        setPaymentMethodId((current) => current ?? methodResult.methods[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load sales.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const today = kigaliToday();
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (drugs ?? []).filter((drug) => {
      if (!needle) return true;
      return `${drug.name} ${drug.genericName} ${drug.sku}`.toLowerCase().includes(needle);
    }).slice(0, 8);
  }, [drugs, query]);
  const selected = drugs?.find((drug) => drug.id === drugId) ?? null;
  const qty = wholeNumber(quantity);
  const lineTotal = selected && qty ? selected.unitPrice * qty : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!selected) {
      setFormError("Choose a drug from the shelf.");
      return;
    }
    if (!qty || qty < 1) {
      setFormError("Enter a quantity of at least 1.");
      return;
    }
    if (!paymentMethodId) {
      setFormError("Choose how the customer is paying.");
      return;
    }
    setPending(true);
    try {
      const result = await api<{ sale: { receipt: PaymentReceipt } }>("/api/sales", {
        method: "POST",
        body: JSON.stringify({ drugId: selected.id, quantity: qty, customerName, paymentMethodId }),
      });
      setReceipt(result.sale.receipt);
      toast.success(`${qty} × ${selected.name} recorded. Stock updated.`);
      setQuantity("1");
      setCustomerName("");
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not record the sale.");
    } finally {
      setPending(false);
    }
  }

  if ((!drugs || !sales) && !error) return <LoadingBlock label="Loading the counter…" />;
  if (!drugs || !sales) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Counter"
        title="Sales"
        lede="A sale takes the quantity off the shelf immediately. Expired stock stays put."
      />
      <div className="grid items-start gap-4 min-[1360px]:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="p-4 min-[1360px]:sticky min-[1360px]:top-6">
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <h2 className="font-serif text-xl">Record a sale</h2>
            {formError ? <Notice>{formError}</Notice> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Find a drug</span>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or SKU"
              />
            </label>
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {matches.length === 0 ? <li className="text-sm text-muted">Nothing matches that search.</li> : null}
              {matches.map((drug) => {
                const blocked = drug.expired || drug.quantity === 0;
                return (
                  <li key={drug.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => setDrugId(drug.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm disabled:opacity-50 ${
                        drug.id === drugId ? "bg-pine-soft" : "hover:bg-paper"
                      }`}
                    >
                      <span>
                        {drug.name} <span className="text-muted">{drug.strength}</span>
                      </span>
                      <span className="text-xs text-muted">
                        {drug.expired ? "Expired" : `${drug.quantity} · ${formatRwf(drug.unitPrice)}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {selected ? (
              <p className="text-sm text-muted">
                {selected.name}: {selected.quantity} on hand, expires {selected.expiryDate}
                {selected.expiryDate < today ? " (expired)" : ""}.
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Quantity</span>
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Payment</span>
              <select
                className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm"
                value={paymentMethodId ?? ""}
                onChange={(event) => setPaymentMethodId(Number(event.target.value))}
              >
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.name}{method.settlesImmediately ? "" : " · on account"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Customer</span>
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Optional. Blank sales are walk-ins."
              />
            </label>
            <div className="flex items-center justify-between">
              <p className="font-serif text-2xl tabular-nums">{formatRwf(lineTotal)}</p>
              <Button type="submit" disabled={pending || !selected}>
                {pending ? "Saving…" : "Take payment"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="min-w-0 p-4">
          <h2 className="mb-3 font-serif text-xl">History</h2>
          {sales.length === 0 ? (
            <p className="text-sm text-muted">No sales yet. The first one will land here and reduce stock.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium first:pl-0">When</th>
                    <th className="px-3 py-2 font-medium">Drug</th>
                    <th className="px-3 py-2 font-medium">For</th>
                    <th className="px-3 py-2 font-medium">Sold by</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty</th>
                    <th className="py-2 pl-3 text-right font-medium whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t border-line">
                      <td className="px-3 py-2.5 text-muted first:pl-0">{formatWhen(sale.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        {sale.drugName} <span className="text-muted">{sale.strength}</span>
                      </td>
                      <td className="px-3 py-2.5">{party(sale)}</td>
                      <td className="px-3 py-2.5">{sale.sellerName}</td>
                      <td className="px-3 py-2.5">
                        {sale.paymentMethodName || "—"}
                        {sale.receiptNumber ? <span className="block text-xs text-muted">{sale.receiptNumber}</span> : null}
                        {sale.receiptNumber ? (
                          <button type="button" className="text-xs text-pine hover:underline" onClick={() => setReceipt(slipFromSale(sale))}>
                            Print
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{sale.quantity}</td>
                      <td className="py-2.5 pl-3 text-right tabular-nums whitespace-nowrap">{formatRwf(sale.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
