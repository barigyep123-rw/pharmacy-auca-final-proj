"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Currency = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isDefault: boolean;
  active: boolean;
};

type PaymentKind = "cash" | "mobile_money" | "card" | "credit" | "custom";

type Method = {
  id: number;
  code: string;
  name: string;
  kind: PaymentKind;
  settlesImmediately: boolean;
  active: boolean;
  sortOrder: number;
};

const kinds: Array<{ id: PaymentKind; label: string }> = [
  { id: "cash", label: "Cash" },
  { id: "mobile_money", label: "Mobile money" },
  { id: "card", label: "Card" },
  { id: "credit", label: "Credit" },
  { id: "custom", label: "Custom" },
];

function selectClass() {
  return "h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm";
}

function kindLabel(kind: PaymentKind) {
  return kinds.find((item) => item.id === kind)?.label ?? kind;
}

export function PaymentsSettings() {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState<Method | null | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const [currencyResult, methodResult] = await Promise.all([
      api<{ currencies: Currency[] }>("/api/currencies"),
      api<{ methods: Method[] }>("/api/payment-methods"),
    ]);
    setCurrencies(currencyResult.currencies);
    setMethods(methodResult.methods);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([api<{ currencies: Currency[] }>("/api/currencies"), api<{ methods: Method[] }>("/api/payment-methods")])
      .then(([currencyResult, methodResult]) => {
        if (cancel) return;
        setCurrencies(currencyResult.currencies);
        setMethods(methodResult.methods);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load payment settings.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function saveCurrency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setFormError(null);
    try {
      await api("/api/currencies", {
        method: "POST",
        body: JSON.stringify({
          code: String(data.get("code") ?? ""),
          name: String(data.get("name") ?? ""),
          symbol: String(data.get("symbol") ?? ""),
          isDefault: data.get("isDefault") === "on",
        }),
      });
      toast.success("Currency added.");
      setCurrencyOpen(false);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not add the currency.");
    } finally {
      setPending(false);
    }
  }

  async function makeDefault(item: Currency) {
    try {
      await api(`/api/currencies/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: item.name, symbol: item.symbol, isDefault: true, active: true }),
      });
      toast.success(`${item.code} is the default.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not change the default.");
    }
  }

  async function retireCurrency(item: Currency) {
    try {
      await api(`/api/currencies/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: item.name, symbol: item.symbol, isDefault: item.isDefault, active: !item.active }),
      });
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the currency.");
    }
  }

  async function removeCurrency(item: Currency) {
    if (!window.confirm(`Remove ${item.code}?`)) return;
    try {
      await api(`/api/currencies/${item.id}`, { method: "DELETE" });
      toast.success(`${item.code} removed.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove the currency.");
    }
  }

  async function saveMethod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const kind = String(data.get("kind") ?? "custom") as PaymentKind;
    const body = {
      name: String(data.get("name") ?? ""),
      kind,
      settlesImmediately: data.get("settlesImmediately") === "on",
      active: data.get("active") === "on",
      sortOrder: Number(data.get("sortOrder") ?? 0),
    };
    setPending(true);
    setFormError(null);
    try {
      if (methodOpen) {
        await api(`/api/payment-methods/${methodOpen.id}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Payment method updated.");
      } else {
        await api("/api/payment-methods", {
          method: "POST",
          body: JSON.stringify({ ...body, code: String(data.get("code") ?? body.name) }),
        });
        toast.success("Payment method added.");
      }
      setMethodOpen(undefined);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the payment method.");
    } finally {
      setPending(false);
    }
  }

  async function removeMethod(item: Method) {
    if (!window.confirm(`Remove ${item.name}?`)) return;
    try {
      await api(`/api/payment-methods/${item.id}`, { method: "DELETE" });
      toast.success(`${item.name} removed.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not remove the payment method.");
    }
  }

  if ((!currencies || !methods) && !error) return <LoadingBlock label="Opening payment settings…" />;
  if (!currencies || !methods) return <Notice>{error}</Notice>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Payments"
        lede="Currencies and the ways a customer can pay. Sales offer only the methods that are still on."
      />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-serif text-xl">Currencies</h2>
          <Button size="sm" onClick={() => { setFormError(null); setCurrencyOpen(true); }}>Add currency</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{item.code}</td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">{item.symbol}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {item.isDefault ? <Badge tone="pine">Default</Badge> : null}
                      <Badge tone={item.active ? "neutral" : "amber"}>{item.active ? "On" : "Off"}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {item.isDefault ? null : (
                        <Button variant="ghost" size="sm" onClick={() => void makeDefault(item)}>Make default</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void retireCurrency(item)}>
                        {item.active ? "Turn off" : "Turn on"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void removeCurrency(item)}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="font-serif text-xl">Payment methods</h2>
          <Button size="sm" onClick={() => { setFormError(null); setMethodOpen(null); }}>Add method</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Settlement</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3">{kindLabel(item.kind)}</td>
                  <td className="px-4 py-3">{item.settlesImmediately ? "Paid now" : "On account"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={item.active ? "pine" : "neutral"}>{item.active ? "Active" : "Off"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setFormError(null); setMethodOpen(item); }}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => void removeMethod(item)}>Remove</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={currencyOpen} onOpenChange={setCurrencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add currency</DialogTitle>
            <DialogDescription>Amounts stay whole numbers of whichever currency is the default.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void saveCurrency(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Code</span>
              <Input name="code" placeholder="USD" required maxLength={3} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <Input name="name" required />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Symbol</span>
              <Input name="symbol" required />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" />
              Make this the default
            </label>
            <DialogFooter>
              <Button type="button" variant="quiet" onClick={() => setCurrencyOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Add currency"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={methodOpen !== undefined} onOpenChange={(next) => { if (!next) setMethodOpen(undefined); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{methodOpen ? "Edit payment method" : "Add payment method"}</DialogTitle>
            <DialogDescription>Cash, mobile money, and card are paid now. Credit stays on account. A custom method can be either.</DialogDescription>
          </DialogHeader>
          {methodOpen !== undefined ? (
            <form className="space-y-4" onSubmit={(event) => void saveMethod(event)} key={methodOpen?.id ?? "new"}>
              {formError ? <Notice>{formError}</Notice> : null}
              {methodOpen ? null : (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Code</span>
                  <Input name="code" placeholder="airtel_money" required />
                </label>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Name</span>
                <Input name="name" defaultValue={methodOpen?.name ?? ""} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Kind</span>
                <select className={selectClass()} name="kind" defaultValue={methodOpen?.kind ?? "custom"}>
                  {kinds.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="settlesImmediately" defaultChecked={methodOpen ? methodOpen.settlesImmediately : true} />
                Money is received now
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={methodOpen ? methodOpen.active : true} />
                Active at the counter
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Sort order</span>
                <Input name="sortOrder" inputMode="numeric" defaultValue={String(methodOpen?.sortOrder ?? methods.length + 1)} />
              </label>
              <DialogFooter>
                <Button type="button" variant="quiet" onClick={() => setMethodOpen(undefined)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save method"}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
