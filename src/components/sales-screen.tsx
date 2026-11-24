"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatRwf } from "@/lib/format";
import { addDays, kigaliToday } from "@/lib/time";
import { baseCount, describeStock } from "@/lib/units";
import type { Drug, PaymentReceipt } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { SearchableSelect } from "./searchable-select";
import { useStaff } from "./session";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice } from "./ui/chrome";

type Tender = { id: number; name: string; settlesImmediately: boolean };
type SoldAs = "base" | "strip" | "pack";
type Brand = { id: number; name: string; manufacturer: string; quantity: number };

type CartLine = {
  key: string;
  drugId: number;
  name: string;
  strength: string;
  soldAs: SoldAs;
  unitName: string;
  quantity: number;
  price: number;
};

function charged(drug: Drug, soldAs: SoldAs, count: number) {
  const perPack = Math.max(1, drug.unitsPerPack);
  const perStrip = Math.max(1, drug.stripSize || 10);
  let unit = drug.unitPrice;
  let each = drug.unitPrice;
  let base = count;
  if (soldAs === "pack") {
    const pack = drug.packPrice > 0 ? drug.packPrice : unit * perPack;
    unit = Math.max(0, Math.round(pack / perPack));
    base = count * perPack;
    each = drug.packPrice > 0 ? drug.packPrice : unit * perPack;
  } else if (soldAs === "strip") {
    const strip = drug.stripPrice > 0 ? drug.stripPrice : unit * perStrip;
    unit = Math.max(0, Math.round(strip / perStrip));
    base = count * perStrip;
    each = drug.stripPrice > 0 ? drug.stripPrice : unit * perStrip;
  }
  return { each, total: unit * base, base };
}

function unitName(drug: Drug, soldAs: SoldAs) {
  if (soldAs === "pack") return drug.packUnit || "box";
  if (soldAs === "strip") return "strip";
  return drug.baseUnit || "tablet";
}

export function SalesScreen({ today }: { today: string }) {
  const staff = useStaff();
  const dispenser = staff?.role === "dispenser";
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [methods, setMethods] = useState<Tender[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [generic, setGeneric] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [picked, setPicked] = useState<Drug | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [soldAs, setSoldAs] = useState<SoldAs>("base");
  const [quantity, setQuantity] = useState("1");
  const [popupError, setPopupError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [amountPaid, setAmountPaid] = useState("");
  const [split, setSplit] = useState(false);
  const [secondMethodId, setSecondMethodId] = useState<number | null>(null);
  const [secondAmount, setSecondAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [memberNumber, setMemberNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dueOn, setDueOn] = useState(() => addDays(kigaliToday(), 30));
  const [cover, setCover] = useState<{
    patientName: string;
    patientPayable: number;
    insurerAmount: number;
    warnings: string[];
  } | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  async function load() {
    const [drugResult, methodResult] = await Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ]);
    setDrugs(drugResult.drugs);
    setMethods(methodResult.methods);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ])
      .then(([drugResult, methodResult]) => {
        if (cancel) return;
        setDrugs(drugResult.drugs);
        setMethods(methodResult.methods);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the counter.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set((drugs ?? []).map((drug) => drug.category).filter(Boolean))).sort()],
    [drugs],
  );
  const generics = useMemo(
    () => ["All", ...Array.from(new Set((drugs ?? []).map((drug) => drug.genericName).filter((name) => name.trim().length >= 2))).sort()],
    [drugs],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (drugs ?? []).filter((drug) => {
      if (dispenser && (drug.quantity < 1 || drug.expired)) return false;
      if (category !== "All" && drug.category !== category) return false;
      if (generic !== "All" && drug.genericName.toLowerCase() !== generic.toLowerCase()) return false;
      if (!needle) return true;
      return `${drug.name} ${drug.genericName} ${drug.sku} ${drug.barcode} ${drug.brandName} ${drug.strength}`.toLowerCase().includes(needle);
    });
  }, [drugs, query, category, generic, dispenser]);

  const total = cart.reduce((sum, line) => sum + line.price, 0);
  const cardReady = memberNumber.trim().length >= 2 && cart.length > 0;
  const activeCover = cardReady ? cover : null;
  const activeCoverError = cardReady ? coverError : null;
  const dueFromPatient = activeCover?.patientPayable ?? total;

  useEffect(() => {
    const member = memberNumber.trim();
    if (member.length < 2 || cart.length === 0) return;
    let cancel = false;
    const handle = window.setTimeout(() => {
      api<{ quote: { patientName: string; patientPayable: number; insurerAmount: number; warnings: string[] } | null }>("/api/insurance/quote", {
        method: "POST",
        body: JSON.stringify({
          memberNumber: member,
          acknowledgeRisks: acknowledge,
          lines: cart.map((line) => ({ drugId: line.drugId, quantity: line.quantity, soldAs: line.soldAs })),
        }),
      })
        .then((result) => {
          if (cancel) return;
          setCover(result.quote);
          setCoverError(null);
        })
        .catch((caught: unknown) => {
          if (cancel) return;
          setCover(null);
          setCoverError(caught instanceof Error ? caught.message : "Could not verify the card.");
        });
    }, 250);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [memberNumber, cart, acknowledge]);
  const credit = methods.find((method) => !method.settlesImmediately) ?? null;
  const nowMethods = methods.filter((method) => method.settlesImmediately);
  const qty = wholeNumber(quantity) ?? 0;
  const quote = picked && qty > 0 ? charged(picked, soldAs, qty) : null;

  async function openProduct(drug: Drug) {
    setPicked(drug);
    setSoldAs("base");
    setQuantity("1");
    setPopupError(null);
    setBrands([]);
    try {
      const result = await api<{ brands: Brand[] }>(`/api/drugs/${drug.id}/brands`);
      setBrands(result.brands);
    } catch {
      setBrands([]);
    }
  }

  function chooseBrand(brand: Brand) {
    const next = drugs?.find((drug) => drug.id === brand.id);
    if (next) setPicked(next);
  }

  function addToCart() {
    if (!picked || !quote || qty < 1) {
      setPopupError("Enter a quantity of at least 1.");
      return;
    }
    const reserved = cart
      .filter((line) => line.drugId === picked.id)
      .reduce((sum, line) => sum + baseCount(line.quantity, line.soldAs, picked.unitsPerPack, picked.stripSize), 0);
    if (reserved + quote.base > picked.quantity) {
      setPopupError(`Only ${describeStock(picked.quantity, picked.unitsPerPack, picked.baseUnit, picked.packUnit)} can leave the shelf.`);
      return;
    }
    const name = unitName(picked, soldAs);
    setCart((current) => {
      const existing = current.find((line) => line.drugId === picked.id && line.soldAs === soldAs);
      if (!existing) {
        return [
          ...current,
          {
            key: `${picked.id}-${soldAs}`,
            drugId: picked.id,
            name: picked.brandName || picked.name,
            strength: picked.strength,
            soldAs,
            unitName: name,
            quantity: qty,
            price: quote.total,
          },
        ];
      }
      const nextQty = existing.quantity + qty;
      return current.map((line) =>
        line.key === existing.key
          ? { ...line, quantity: nextQty, price: charged(picked, soldAs, nextQty).total }
          : line,
      );
    });
    setPicked(null);
  }

  function openPay() {
    const first = nowMethods[0]?.id ?? null;
    const second = nowMethods.find((method) => method.id !== first)?.id ?? first;
    setMethodId(first);
    setSecondMethodId(second);
    setAmountPaid(String(dueFromPatient));
    setSecondAmount("");
    setSplit(false);
    setPayError(null);
    setPayOpen(true);
  }

  async function submit(
    kind: "bill" | "sale",
    tenders?: Array<{ paymentMethodId: number; amount: number }>,
    risks = acknowledge,
  ) {
    if (cart.length === 0) return;
    const onAccount = kind === "bill" || (tenders?.length ?? 0) > 0;
    const method = onAccount ? credit : nowMethods.find((item) => item.id === methodId) ?? nowMethods[0];
    if (!method) {
      const message = onAccount
        ? "Add a credit method in Settings before billing later or splitting a payment."
        : "Choose how the customer is paying.";
      setPayError(message);
      if (kind === "bill") toast.error(message);
      return;
    }
    const named = customerName.trim() || activeCover?.patientName || "";
    if (kind === "bill" && named.length < 2) {
      toast.error("Put the customer name on a bill that will be paid later.");
      return;
    }
    setPending(true);
    try {
      const result = await api<{ basket: { receipt: PaymentReceipt } }>("/api/sales/basket", {
        method: "POST",
        body: JSON.stringify({
          customerName: named,
          memberNumber: cardReady ? memberNumber.trim() : "",
          customerPhone,
          dueOn,
          paymentMethodId: method.id,
          acknowledgeRisks: risks,
          lines: cart.map((line) => ({ drugId: line.drugId, quantity: line.quantity, soldAs: line.soldAs })),
          ...(tenders && tenders.length > 0 ? { tenders } : {}),
        }),
      });
      setReceipt(result.basket.receipt);
      setCart([]);
      setCustomerName("");
      setMemberNumber("");
      setAcknowledge(false);
      setPayOpen(false);
      toast.success(kind === "bill" ? "Bill saved. Stock is already off the shelf." : "Sale recorded.");
      await load();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not record that.";
      if (kind === "sale") setPayError(message);
      else toast.error(message);
    } finally {
      setPending(false);
    }
  }

  function takePayment(risks = acknowledge) {
    const paid = wholeNumber(amountPaid) ?? 0;
    const second = split ? wholeNumber(secondAmount) ?? 0 : 0;
    if (!methodId) {
      setPayError("Choose how the customer is paying.");
      return;
    }
    if (paid < 1 && dueFromPatient > 0) {
      setPayError("Enter the amount paid.");
      return;
    }
    if (paid > dueFromPatient) {
      setPayError(`After insurance the patient owes ${formatRwf(dueFromPatient)}.`);
      return;
    }
    if (split && (!secondMethodId || secondMethodId === methodId)) {
      setPayError("Choose a second, different way to pay.");
      return;
    }
    if (split && (second < 1 || second >= paid)) {
      setPayError("The second amount has to be part of the amount paid.");
      return;
    }
    if (!split && paid === dueFromPatient) {
      void submit("sale", undefined, risks);
      return;
    }
    const tenders = split
      ? [
          { paymentMethodId: methodId, amount: paid - second },
          { paymentMethodId: secondMethodId as number, amount: second },
        ]
      : [{ paymentMethodId: methodId, amount: paid }];
    void submit("sale", tenders, risks);
  }

  if (!drugs && !error) return <LoadingBlock label="Opening the counter…" />;
  if (!drugs) return <Notice>{error}</Notice>;

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-card">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-serif text-xl">Cart</h2>
            <Input
              className="mt-2"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer, if this is a bill"
            />
            <Input
              className="mt-2"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="Phone, if they will pay later"
            />
            <label className="mt-2 block text-xs text-muted">
              Due date if this stays on credit
              <Input type="date" className="mt-1" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
            </label>
            <Input
              className="mt-2"
              value={memberNumber}
              onChange={(event) => setMemberNumber(event.target.value)}
              placeholder="Insurance member number"
            />
            {activeCoverError ? <p className="mt-2 text-xs text-clay">{activeCoverError}</p> : null}
            {activeCover ? (
              <p className="mt-2 text-xs text-muted">
                {activeCover.patientName}: patient {formatRwf(activeCover.patientPayable)}, insurer {formatRwf(activeCover.insurerAmount)}.
                {activeCover.warnings[0] ? ` ${activeCover.warnings[0]}` : ""}
              </p>
            ) : null}
            {activeCoverError && !acknowledge ? (
              <button type="button" className="mt-1 text-xs text-pine hover:underline" onClick={() => setAcknowledge(true)}>
                Accept and let the patient pay the rest
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <p className="text-sm text-muted">Nothing selected yet. Tap a product on the right.</p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium">{line.name}</p>
                      <p className="text-muted">
                        {line.quantity} {line.unitName}
                        {line.strength ? ` · ${line.strength}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{formatRwf(line.price)}</p>
                      <button
                        type="button"
                        className="text-xs text-clay hover:underline"
                        onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-40 flex-col rounded-2xl border border-line bg-card md:min-h-0">
          <div className="space-y-2 border-b border-line px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-xl">Products</h2>
              {dispenser ? <span className="text-xs text-muted">Sellable stock</span> : null}
            </div>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a generic, brand, or barcode" />
            <div className="flex gap-1 overflow-x-auto pb-1">
              {generics.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${generic === item ? "bg-brass text-pine-deep" : "bg-paper text-muted"}`}
                  onClick={() => setGeneric(item)}
                >
                  {item === "All" ? "All generics" : item}
                </button>
              ))}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${category === item ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto p-3 xl:grid-cols-3">
            {matches.length === 0 ? <li className="col-span-2 text-sm text-muted">Nothing on this shelf matches.</li> : null}
            {matches.map((drug) => {
              const blocked = drug.expired || drug.quantity === 0 || drug.rxOnly;
              return (
                <li key={drug.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => void openProduct(drug)}
                    className="flex h-full min-h-24 w-full flex-col justify-between rounded-xl bg-paper px-3 py-2 text-left disabled:opacity-45"
                  >
                    {drug.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/drugs/${drug.id}/photo`} alt="" className="mb-2 h-16 w-full rounded-lg object-cover" />
                    ) : null}
                    <span>
                      <span className="block text-xs uppercase tracking-wide text-muted">{drug.genericName || "No generic"}</span>
                      <span className="block font-medium">{drug.brandName || drug.name}</span>
                      <span className="text-xs text-muted">{[drug.strength, drug.form].filter(Boolean).join(" ")}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {formatRwf(drug.unitPrice)}
                      {drug.rxOnly ? " · Script" : drug.expired || drug.expiryDate < today ? " · Expired" : ` · ${describeStock(drug.quantity, drug.unitsPerPack, drug.baseUnit, drug.packUnit)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3">
        <p className="font-serif text-2xl tabular-nums">{formatRwf(total)}</p>
        <div className="flex gap-2">
          <Button type="button" variant="quiet" disabled={pending || cart.length === 0} onClick={() => void submit("bill")}>
            Create bill
          </Button>
          <Button type="button" disabled={pending || cart.length === 0} onClick={openPay}>
            Make sale
          </Button>
        </div>
      </div>

      <Dialog open={picked !== null} onOpenChange={(open) => { if (!open) setPicked(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{picked?.brandName || picked?.name}</DialogTitle>
            <DialogDescription>
              {picked ? `${picked.genericName || "Brand"} ${picked.strength}`.trim() : ""}
              {picked ? ` · ${describeStock(picked.quantity, picked.unitsPerPack, picked.baseUnit, picked.packUnit)} on hand` : ""}
            </DialogDescription>
          </DialogHeader>
          {popupError ? <Notice>{popupError}</Notice> : null}
          {brands.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-1">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-xs ${brand.id === picked?.id ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                  onClick={() => chooseBrand(brand)}
                >
                  {brand.name}{brand.manufacturer ? ` · ${brand.manufacturer}` : ""}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(["base", "strip", "pack"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-full px-3 py-1 text-sm ${soldAs === option ? "bg-pine text-paper-2" : "bg-paper text-muted"}`}
                onClick={() => setSoldAs(option)}
              >
                {option === "base" ? picked?.baseUnit || "Tablet" : option === "strip" ? "Strip" : `Full ${picked?.packUnit || "box"}`}
                {picked && qty > 0 ? ` · ${formatRwf(charged(picked, option, 1).each)}` : ""}
              </button>
            ))}
          </div>
          <label className="mt-3 block space-y-1.5">
            <span className="text-sm font-medium">Quantity</span>
            <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <p className="mt-3 font-serif text-2xl tabular-nums">{quote ? formatRwf(quote.total) : formatRwf(0)}</p>
          <DialogFooter>
            <Button type="button" onClick={addToCart}>Add to cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
            <DialogDescription>
              {activeCover
                ? `The shelf price is ${formatRwf(total)}. The patient owes ${formatRwf(activeCover.patientPayable)} after ${formatRwf(activeCover.insurerAmount)} from insurance.`
                : `The bill is ${formatRwf(total)}. A smaller amount leaves the rest to be paid later.`}
            </DialogDescription>
          </DialogHeader>
          {payError ? <Notice>{payError}</Notice> : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Mode of payment</span>
            <SearchableSelect
              value={methodId == null ? "" : String(methodId)}
              options={nowMethods.map((method) => ({ value: String(method.id), label: method.name }))}
              onChange={(value) => setMethodId(Number(value))}
            />
          </label>
          <label className="mt-3 block space-y-1.5">
            <span className="text-sm font-medium">Amount paid now</span>
            <Input inputMode="numeric" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />
            Split across payment modes
          </label>
          {split ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Second mode</span>
                <SearchableSelect
                  value={secondMethodId == null ? "" : String(secondMethodId)}
                  options={nowMethods.map((method) => ({ value: String(method.id), label: method.name }))}
                  onChange={(value) => setSecondMethodId(Number(value))}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Second amount</span>
                <Input inputMode="numeric" value={secondAmount} onChange={(event) => setSecondAmount(event.target.value)} />
              </label>
            </div>
          ) : null}
          {payError && !acknowledge ? (
            <Button type="button" variant="quiet" className="mt-3" onClick={() => { setAcknowledge(true); takePayment(true); }}>
              Acknowledge the warning and try again
            </Button>
          ) : null}
          <DialogFooter>
            <Button type="button" disabled={pending} onClick={() => takePayment()}>{pending ? "Saving…" : "Make sale"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
