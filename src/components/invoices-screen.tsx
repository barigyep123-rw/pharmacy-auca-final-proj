"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf } from "@/lib/format";
import type { SupplierInvoice } from "@/lib/finance";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

export function InvoicesScreen({ today }: { today: string }) {
  const [invoices, setInvoices] = useState<SupplierInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [issuedOn, setIssuedOn] = useState(today);
  const [notes, setNotes] = useState("");

  async function load() {
    const result = await api<{ invoices: SupplierInvoice[] }>("/api/finance/invoices");
    setInvoices(result.invoices);
  }

  useEffect(() => {
    let cancel = false;
    api<{ invoices: SupplierInvoice[] }>("/api/finance/invoices")
      .then((result) => {
        if (!cancel) setInvoices(result.invoices);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load invoices.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = wholeNumber(amount);
    if (value == null) {
      setFormError("Enter the invoice amount in whole francs.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api("/api/finance/invoices", {
        method: "POST",
        body: JSON.stringify({ supplierName, invoiceNumber, amount: value, issuedOn, notes }),
      });
      toast.success("Invoice recorded.");
      setOpen(false);
      setSupplierName("");
      setInvoiceNumber("");
      setAmount("");
      setNotes("");
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the invoice.");
    } finally {
      setPending(false);
    }
  }

  async function pay(id: number) {
    try {
      await api(`/api/finance/invoices/${id}`, { method: "POST", body: "{}" });
      toast.success("Invoice marked paid. It is money out of the ledger.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not pay the invoice.");
    }
  }

  if (!invoices && !error) return <LoadingBlock label="Opening supplier invoices…" />;
  if (!invoices) return <Notice>{error}</Notice>;

  const openTotal = invoices.filter((item) => item.status === "open").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Invoices"
        lede="Supplier bills are money out. They are separate from the cash, mobile money, card, and credit a customer uses at the counter."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{formatRwf(openTotal)} still unpaid</p>
        <Button onClick={() => { setFormError(null); setOpen(true); }}>Record invoice</Button>
      </div>
      <Card className="overflow-hidden">
        {invoices.length === 0 ? (
          <p className="p-4 text-sm text-muted">No supplier invoices yet. Record one when a bill arrives.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      {invoice.supplierName}
                      {invoice.terms ? <p className="text-xs text-muted">{invoice.terms}</p> : null}
                      {invoice.notes ? <p className="text-xs text-muted">{invoice.notes}</p> : null}
                    </td>
                    <td className="px-4 py-3">{formatDay(invoice.issuedOn)}</td>
                    <td className="px-4 py-3">
                      {invoice.status === "paid" ? (
                        <Badge tone="pine">Paid</Badge>
                      ) : (
                        <Button size="sm" variant="quiet" onClick={() => void pay(invoice.id)}>Mark paid</Button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRwf(invoice.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a supplier invoice</DialogTitle>
            <DialogDescription>This does not change shelf stock. Receiving an order does that.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void save(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Supplier</span>
              <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Invoice number</span>
              <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Amount (RWF)</span>
              <Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Invoice date</span>
              <Input type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Notes</span>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <DialogFooter>
              <Button type="button" variant="quiet" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save invoice"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
