"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatRwf, formatWhen } from "@/lib/format";
import { baseCount, describeStock, unitLabel } from "@/lib/units";
import type { Drug, PaymentReceipt, Sale } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { useStaff } from "./session";
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
        directions: sale.directions,
        lotLabel: sale.lotLabel,
      },
    ],
    fiscalNote: sale.fiscalCode
      ? `Local fiscal mark ${sale.fiscalCode}. Not an RRA-signed EBM receipt.`
      : undefined,
  };
}

function party(sale: Sale) {
  if (sale.prescriptionId) return `Prescription #${sale.prescriptionId}`;
  return sale.customerName || "Walk-in";
}

export function SalesScreen({ today }: { today: string }) {
  const staff = useStaff();
  const dispenser = staff?.role === "dispenser";
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [dose, setDose] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [brands, setBrands] = useState<Array<{ id: number; name: string; manufacturer: string; quantity: number }>>([]);
  const [drugId, setDrugId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [soldAs, setSoldAs] = useState<"base" | "strip" | "pack">("base");
  const [customerName, setCustomerName] = useState("");
  const [methods, setMethods] = useState<Tender[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  useEffect(() => {
    if (!drugId) return;
    let cancel = false;
    api<{ brands: Array<{ id: number; name: string; manufacturer: string; quantity: number }> }>(`/api/drugs/${drugId}/brands`)
      .then((result) => {
        if (!cancel) setBrands(result.brands);
      })
      .catch(() => {
        if (!cancel) setBrands([]);
      });
    return () => {
      cancel = true;
    };
  }, [drugId]);

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

  const categories = useMemo(
    () => ["All", ...Array.from(new Set((drugs ?? []).map((drug) => drug.category).filter(Boolean))).sort()],
    [drugs],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (drugs ?? []).filter((drug) => {
      if (dispenser && (drug.quantity < 1 || drug.expired)) return false;
      if (category !== "All" && drug.category !== category) return false;
      if (!needle) return true;
      return `${drug.name} ${drug.genericName} ${drug.sku} ${drug.barcode} ${drug.brandName}`.toLowerCase().includes(needle);
    });
  }, [drugs, query, category, dispenser]);
  const selected = drugs?.find((drug) => drug.id === drugId) ?? null;
  const qty = wholeNumber(quantity);
  const baseQty = selected && qty ? baseCount(qty, soldAs, selected.unitsPerPack, selected.stripSize) : 0;
  const lineTotal = selected && qty
    ? soldAs === "pack" && selected.packPrice
      ? selected.packPrice * qty
      : soldAs === "strip" && selected.stripPrice
        ? selected.stripPrice * qty
        : selected.unitPrice * baseQty
    : 0;

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
        body: JSON.stringify({
          drugId: selected.id,
          quantity: qty,
          soldAs,
          customerName,
          paymentMethodId,
          dose,
          frequency,
          duration,
          directions: [dose, frequency, duration].filter(Boolean).join(" · "),
        }),
      });
      setReceipt(result.sale.receipt);
      toast.success(`${baseQty} ${selected.baseUnit}s of ${selected.name} recorded. Stock updated.`);
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
            <div className="flex flex-wrap gap-1">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-xs ${category === item ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
              {matches.length === 0 ? <li className="col-span-2 text-sm text-muted">Nothing matches that search.</li> : null}
              {matches.map((drug) => {
                const blocked = drug.expired || drug.quantity === 0;
                return (
                  <li key={drug.id}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => setDrugId(drug.id)}
                      className={`flex min-h-20 w-full flex-col justify-between rounded-xl px-2 py-2 text-left text-sm disabled:opacity-50 ${
                        drug.id === drugId ? "bg-pine-soft" : "bg-paper hover:bg-card"
                      }`}
                    >
                      <span>
                        {drug.name} <span className="text-muted">{drug.strength}</span>
                      </span>
                      <span className="text-xs text-muted">
                        {drug.expired ? "Expired" : `${describeStock(drug.quantity, drug.unitsPerPack, drug.baseUnit, drug.packUnit)}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(drugId ? brands : []).length > 1 ? (
              <div className="flex flex-wrap gap-1">
                {brands.map((brand) => (
                  <button
                    key={brand.id}
                    type="button"
                    className={`rounded-full px-2 py-1 text-xs ${brand.id === drugId ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                    onClick={() => setDrugId(brand.id)}
                  >
                    {brand.name}{brand.manufacturer ? ` · ${brand.manufacturer}` : ""} ({brand.quantity})
                  </button>
                ))}
              </div>
            ) : null}
            {selected ? (
              <p className="text-sm text-muted">
                {selected.name}: {describeStock(selected.quantity, selected.unitsPerPack, selected.baseUnit, selected.packUnit)} on hand, expires {selected.expiryDate}
                {selected.expiryDate < today ? " (expired)" : ""}.
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${soldAs === "base" ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                onClick={() => setSoldAs("base")}
              >
                {selected?.baseUnit ?? "Base unit"}
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${soldAs === "pack" ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                onClick={() => setSoldAs("pack")}
              >
                {selected?.packUnit ?? "Pack"}
                {selected?.packPrice ? ` · ${formatRwf(selected.packPrice)}` : ""}
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${soldAs === "strip" ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                onClick={() => setSoldAs("strip")}
              >
                Strip{selected?.stripPrice ? ` · ${formatRwf(selected.stripPrice)}` : ""}
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Directions</span>
              <Input value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Dose, optional" />
              <Input value={frequency} onChange={(event) => setFrequency(event.target.value)} placeholder="How often" />
              <Input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="For how long" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Quantity</span>
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {selected && qty ? (
                <span className="block text-xs text-muted">
                  Takes {unitLabel(baseQty, selected.baseUnit)} off the shelf
                  {soldAs === "pack" ? ` (${qty} × ${selected.unitsPerPack})` : ""}. Loose {selected.baseUnit}s stay as they are.
                </span>
              ) : null}
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

        {dispenser ? (
          <Card className="min-w-0 p-4">
            <h2 className="font-serif text-xl">Sellable stock</h2>
            <p className="mt-2 text-sm text-muted">Expired and empty lines stay off this counter. Reprint a receipt from Bills.</p>
          </Card>
        ) : null}
        {dispenser ? null : <Card className="min-w-0 p-4">
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
        </Card>}
      </div>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
