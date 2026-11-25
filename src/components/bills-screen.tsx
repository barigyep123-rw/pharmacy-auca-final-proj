"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf, formatWhen } from "@/lib/format";
import type { Bill, CreditAccount } from "@/lib/pharmacy";
import { kigaliToday } from "@/lib/time";
import type { PaymentReceipt } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { SearchableSelect } from "./searchable-select";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Tender = { id: number; name: string; settlesImmediately: boolean };

export function BillsScreen() {
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [methods, setMethods] = useState<Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Bill | null>(null);
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const today = kigaliToday();

  async function load() {
    const [result, tenders] = await Promise.all([
      api<{ bills: Bill[]; accounts: CreditAccount[] }>("/api/bills"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ]);
    setBills(result.bills);
    setAccounts(result.accounts);
    const payable = tenders.methods.filter((method) => method.settlesImmediately);
    setMethods(payable);
    setMethodId((current) => current ?? payable[0]?.id ?? null);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ bills: Bill[]; accounts: CreditAccount[] }>("/api/bills"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ])
      .then(([result, tenders]) => {
        if (cancel) return;
        setBills(result.bills);
        setAccounts(result.accounts);
        const payable = tenders.methods.filter((method) => method.settlesImmediately);
        setMethods(payable);
        setMethodId((current) => current ?? payable[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load bills.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function collect(event: FormEvent) {
    event.preventDefault();
    if (!open || !methodId) return;
    const value = wholeNumber(amount);
    if (!value || value < 1) {
      setFormError("Enter the amount collected.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      await api("/api/bills/collect", {
        method: "POST",
        body: JSON.stringify({ saleIds: open.saleIds, amount: value, paymentMethodId: methodId }),
      });
      toast.success("Payment recorded.");
      setOpen(null);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not record the payment.");
    } finally {
      setPending(false);
    }
  }

  if (!bills && !error) return <LoadingBlock label="Opening bills…" />;
  if (!bills) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Counter"
        title="Bills"
        lede="Credit stays with the customer until they pay. Thirty days is the default. Cash and mobile money both count."
      />
      <Card className="mb-4 p-4">
        <h2 className="text-base font-semibold">Who owes</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody has an open balance.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {accounts.map((account) => (
              <li key={account.customerName} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{account.customerName}</span>
                  <span className="ml-2 text-muted">{account.phone || "No phone"} · {account.openBills} open</span>
                </span>
                <span className="tabular-nums">
                  {formatRwf(account.balance)}
                  {account.oldestDue ? <span className={account.oldestDue < today ? "ml-2 text-clay" : "ml-2 text-muted"}>due {formatDay(account.oldestDue)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        {bills.length === 0 ? <p className="p-4 text-sm text-muted">No bills yet.</p> : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="scan-table w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.key} className="border-t border-line">
                    <td className="px-4 py-3 text-muted">{formatWhen(bill.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{bill.customerName || "Walk-in"}</p>
                      <p className="text-xs text-muted">{bill.lines.map((line) => line.name).join(", ")}</p>
                    </td>
                    <td className={`px-4 py-3 ${bill.dueOn && bill.dueOn < today && bill.balance > 0 ? "text-clay" : "text-muted"}`}>
                      {bill.dueOn ? formatDay(bill.dueOn) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{bill.balance > 0 ? formatRwf(bill.balance) : "Paid"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 text-sm text-pine hover:underline"
                        onClick={() => setReceipt({
                          numbers: bill.receiptNumbers,
                          issuedAt: bill.createdAt,
                          customerName: bill.customerName,
                          sellerName: bill.sellerName,
                          paymentMethodName: bill.payments.map((payment) => payment.method).join(" + ") || "Credit",
                          settlesImmediately: bill.balance === 0,
                          fiscalNote: bill.fiscalNote,
                          lines: bill.lines,
                        })}
                      >
                        Reprint
                      </button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          setOpen(bill);
                          setOpenLine(null);
                          setAmount(bill.balance > 0 ? String(bill.balance) : "");
                          setFormError(null);
                        }}
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={Boolean(open)} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <DialogContent size="lg">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.customerName || "Walk-in"} · {open.balance > 0 ? formatRwf(open.balance) : "Paid"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <section className="rounded-xl border border-line p-3">
                  <h3 className="font-medium">Customer</h3>
                  <p className="mt-1">{open.customerName || "Walk-in"}</p>
                  <p className="text-muted">{open.customerPhone || "No phone"}</p>
                  <p className="text-muted">{open.dueOn ? `Due ${formatDay(open.dueOn)}` : "No due date"}</p>
                  {open.patientId ? <Link className="text-pine hover:underline" href={`/patients/${open.patientId}`}>Open the patient record</Link> : null}
                </section>
                <section className="rounded-xl border border-line p-3">
                  <h3 className="font-medium">Sale</h3>
                  <p className="mt-1 text-muted">{formatWhen(open.createdAt)} · {open.sellerName}</p>
                  <p className="text-muted">{open.receiptNumbers.join(", ") || "No receipt number"}</p>
                  <p>Balance {open.balance > 0 ? formatRwf(open.balance) : "Paid"}</p>
                  {open.fiscalNote ? <p className="text-xs text-muted">{open.fiscalNote}</p> : null}
                </section>
              </div>
              <section>
                <h3 className="text-sm font-medium">Lines</h3>
                <ul className="divide-y divide-line text-sm">
                  {open.lines.map((line, index) => (
                    <li key={`${line.drugId}-${index}`}>
                      <button type="button" className="flex w-full justify-between gap-3 py-2 text-left" onClick={() => setOpenLine(openLine === index ? null : index)}>
                        <span>{line.name} {line.strength} · {line.quantity} × {formatRwf(line.unitPrice)}</span>
                        <span className="tabular-nums">{formatRwf(line.total)}</span>
                      </button>
                      {openLine === index ? (
                        <p className="pb-2 text-xs text-muted">
                          {line.lotLabel || "No lot"}{line.directions ? ` · ${line.directions}` : ""}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="text-sm font-medium">Payments</h3>
                {open.history.length === 0 ? <p className="mt-1 text-sm text-muted">No payment yet.</p> : (
                  <ul className="mt-1 text-sm text-muted">
                    {open.history.map((payment, index) => (
                      <li key={`${payment.at}-${index}`}>{formatWhen(payment.at)} · {payment.method} · {formatRwf(payment.amount)} · {payment.by}</li>
                    ))}
                  </ul>
                )}
                {open.coverages.length > 0 ? (
                  <ul className="mt-2 text-sm text-muted">
                    {open.coverages.map((coverage, index) => (
                      <li key={`${coverage.insurer}-${index}`}>{coverage.insurer} cover {formatRwf(coverage.amount)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
              <p className="text-sm">Still due {formatRwf(open.balance)}{open.dueOn ? ` by ${formatDay(open.dueOn)}` : ""}.</p>
              {open.balance > 0 ? (
                <form className="space-y-3" onSubmit={(event) => void collect(event)}>
                  {formError ? <Notice>{formError}</Notice> : null}
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Amount now</span>
                    <Input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Paid with</span>
                    <SearchableSelect
                      value={methodId == null ? "" : String(methodId)}
                      options={methods.map((method) => ({ value: String(method.id), label: method.name }))}
                      onChange={(value) => setMethodId(Number(value))}
                    />
                  </label>
                  <DialogFooter>
                    <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button>
                  </DialogFooter>
                </form>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
