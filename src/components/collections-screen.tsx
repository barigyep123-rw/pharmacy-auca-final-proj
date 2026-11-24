"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatRwf, formatWhen } from "@/lib/format";
import type { OutstandingSale } from "@/lib/finance";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { SearchableSelect } from "./searchable-select";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Tender = { id: number; name: string; settlesImmediately: boolean };

export function CollectionsScreen() {
  const [sales, setSales] = useState<OutstandingSale[] | null>(null);
  const [methods, setMethods] = useState<Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<OutstandingSale | null>(null);
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const [due, tenders] = await Promise.all([
      api<{ sales: OutstandingSale[] }>("/api/finance/collections"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ]);
    setSales(due.sales);
    const payable = tenders.methods.filter((method) => method.settlesImmediately);
    setMethods(payable);
    setPaymentMethodId((current) => current ?? payable[0]?.id ?? null);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ sales: OutstandingSale[] }>("/api/finance/collections"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ])
      .then(([due, tenders]) => {
        if (cancel) return;
        setSales(due.sales);
        const payable = tenders.methods.filter((method) => method.settlesImmediately);
        setMethods(payable);
        setPaymentMethodId((current) => current ?? payable[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load outstanding credit.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function collect(event: React.FormEvent) {
    event.preventDefault();
    if (!target || !paymentMethodId) return;
    const value = wholeNumber(amount);
    if (!value || value < 1) {
      setFormError("Enter the amount collected.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api("/api/finance/collections", {
        method: "POST",
        body: JSON.stringify({ saleId: target.id, amount: value, paymentMethodId }),
      });
      toast.success("Collection recorded.");
      setTarget(null);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not record the collection.");
    } finally {
      setPending(false);
    }
  }

  if (!sales && !error) return <LoadingBlock label="Looking for credit still due…" />;
  if (!sales) return <Notice>{error}</Notice>;

  const due = sales.reduce((sum, sale) => sum + sale.remaining, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Collections"
        lede="Credit sales stay here until someone pays. Collect into cash, mobile money, or card."
      />
      <p className="mb-4 text-sm text-muted">{formatRwf(due)} outstanding</p>
      <Card className="overflow-hidden">
        {sales.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nothing is on account. A credit sale at the counter will show up here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Sale</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-line">
                    <td className="px-4 py-3 text-muted">{formatWhen(sale.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{sale.drugName}</p>
                      <p className="text-xs text-muted">{sale.receiptNumber || "No receipt"} · {formatRwf(sale.total)} sale</p>
                    </td>
                    <td className="px-4 py-3">{sale.customerName || "Walk-in"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRwf(sale.remaining)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          setTarget(sale);
                          setAmount(String(sale.remaining));
                          setFormError(null);
                        }}
                      >
                        Collect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={Boolean(target)} onOpenChange={(next) => { if (!next) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collect {target ? formatRwf(target.remaining) : ""}</DialogTitle>
            <DialogDescription>
              {target ? `${target.drugName} · ${target.customerName || "Walk-in"}` : ""}
            </DialogDescription>
          </DialogHeader>
          {target ? (
            <form className="space-y-4" onSubmit={(event) => void collect(event)}>
              {formError ? <Notice>{formError}</Notice> : null}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Amount (RWF)</span>
                <Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Paid with</span>
                <SearchableSelect
                  value={paymentMethodId == null ? "" : String(paymentMethodId)}
                  options={methods.map((method) => ({ value: String(method.id), label: method.name }))}
                  onChange={(value) => setPaymentMethodId(Number(value))}
                />
              </label>
              <DialogFooter>
                <Button type="button" variant="quiet" onClick={() => setTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record collection"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
