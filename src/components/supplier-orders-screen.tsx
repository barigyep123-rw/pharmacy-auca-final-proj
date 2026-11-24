"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { suggestedOrderQty, wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf, formatWhen } from "@/lib/format";
import type { Drug, PurchaseOrder } from "@/lib/types";
import { mergeSupplierNames, SupplierField } from "./supplier-field";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type OrderFilter = "all" | PurchaseOrder["status"];
type OrderLine = {
  key: string;
  drugId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
  batchNumber: string;
};

const orderFilters: Array<{ id: OrderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ordered", label: "Open" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
];

function blankOrderLine(partial?: Partial<OrderLine>): OrderLine {
  return {
    key: crypto.randomUUID(),
    drugId: "",
    quantity: "1",
    unitCost: "0",
    expiryDate: "",
    batchNumber: "",
    ...partial,
  };
}

export function SupplierOrdersScreen() {
  const search = useSearchParams();
  const openedFromShelf = useRef(false);
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [ordering, setOrdering] = useState<OrderLine[] | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const shelfDrugId = search.get("drug");

  async function load() {
    const [catalog, purchase, saved] = await Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ orders: PurchaseOrder[] }>("/api/purchase-orders"),
      api<{ suppliers: string[] }>("/api/suppliers").catch(() => ({ suppliers: [] as string[] })),
    ]);
    setDrugs(catalog.drugs);
    setOrders(purchase.orders);
    setSuppliers(
      mergeSupplierNames([
        ...saved.suppliers,
        ...catalog.drugs.map((drug) => drug.supplier),
        ...purchase.orders.map((order) => order.supplierName),
      ]),
    );
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ orders: PurchaseOrder[] }>("/api/purchase-orders"),
      api<{ suppliers: string[] }>("/api/suppliers").catch(() => ({ suppliers: [] as string[] })),
    ])
      .then(([catalog, purchase, saved]) => {
        if (cancel) return;
        setDrugs(catalog.drugs);
        setOrders(purchase.orders);
        setSuppliers(
          mergeSupplierNames([
            ...saved.suppliers,
            ...catalog.drugs.map((drug) => drug.supplier),
            ...purchase.orders.map((order) => order.supplierName),
          ]),
        );
        if (openedFromShelf.current || !shelfDrugId) return;
        const drug = catalog.drugs.find((item) => String(item.id) === shelfDrugId);
        if (!drug) return;
        openedFromShelf.current = true;
        setSupplierName(drug.supplier);
        setOrderNotes("");
        setOrdering([
          blankOrderLine({
            drugId: String(drug.id),
            quantity: String(Math.ceil(suggestedOrderQty(drug.quantity, drug.reorderLevel) / Math.max(1, drug.unitsPerPack))),
          }),
        ]);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load supplier orders.");
      });
    return () => {
      cancel = true;
    };
  }, [shelfDrugId]);

  const visible = (orders ?? []).filter((order) => filter === "all" || order.status === filter);
  const openCount = (orders ?? []).filter((order) => order.status === "ordered").length;

  if ((!drugs || !orders) && !error) return <LoadingBlock label="Opening supplier orders…" />;
  if (!drugs || !orders) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier orders"
        lede={`${openCount} open. Placing an order does not change the shelf. Receiving it is what adds the stock.`}
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setSupplierName("");
              setOrderNotes("");
              setOrdering([blankOrderLine()]);
            }}
          >
            New supplier order
          </Button>
        }
      />
      <Orders orders={visible} filter={filter} onFilter={setFilter} onOpen={setSelectedOrder} />
      <OrderDialog
        lines={ordering}
        drugs={drugs}
        suppliers={suppliers}
        supplierName={supplierName}
        notes={orderNotes}
        error={formError}
        pending={pending}
        onSupplier={setSupplierName}
        onSupplierCreated={(name) => setSuppliers((current) => mergeSupplierNames([...current, name]))}
        onNotes={setOrderNotes}
        onLines={setOrdering}
        onClose={() => setOrdering(null)}
        onSubmit={async () => {
          if (!ordering) return;
          setFormError(null);
          const items = [];
          for (const line of ordering) {
            const drugId = Number(line.drugId);
            const quantity = wholeNumber(line.quantity);
            const unitCost = wholeNumber(line.unitCost);
            if (!drugId || !quantity || unitCost == null) {
              setFormError("Each line needs a drug, a quantity, and a unit cost.");
              return;
            }
            items.push({
              drugId,
              packs: quantity,
              unitCost,
              expiryDate: line.expiryDate,
              batchNumber: line.batchNumber,
            });
          }
          setPending(true);
          try {
            await api("/api/purchase-orders", {
              method: "POST",
              body: JSON.stringify({ supplierName, notes: orderNotes, items }),
            });
            toast.success("Order placed. Stock stays the same until you receive it.");
            setOrdering(null);
            await load();
          } catch (caught) {
            setFormError(caught instanceof Error ? caught.message : "Could not place the order.");
          } finally {
            setPending(false);
          }
        }}
      />
      <OrderDetail
        order={selectedOrder}
        pending={pending}
        onClose={() => setSelectedOrder(null)}
        onReceive={async (id) => {
          setPending(true);
          try {
            await api(`/api/purchase-orders/${id}/receive`, { method: "POST", body: "{}" });
            toast.success("Delivery received. Shelf quantities went up.");
            setSelectedOrder(null);
            await load();
          } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Could not receive the order.");
          } finally {
            setPending(false);
          }
        }}
        onCancel={async (id) => {
          setPending(true);
          try {
            await api(`/api/purchase-orders/${id}/cancel`, { method: "POST", body: "{}" });
            toast.success("Order cancelled. Stock was not changed.");
            setSelectedOrder(null);
            await load();
          } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : "Could not cancel the order.");
          } finally {
            setPending(false);
          }
        }}
      />
    </div>
  );
}

function Orders({
  orders,
  filter,
  onFilter,
  onOpen,
}: {
  orders: PurchaseOrder[];
  filter: OrderFilter;
  onFilter: (value: OrderFilter) => void;
  onOpen: (order: PurchaseOrder) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        {orderFilters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilter(item.id)}
            className={`rounded-full px-3 py-1 text-xs ${filter === item.id ? "bg-ink text-paper-2" : "bg-paper text-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="border-b border-line px-4 py-3 text-sm text-muted">
        An open order is a promise from the supplier. Receiving it is what increases the quantities on the shelf. Drafts stay on Draft orders until they are sent.
      </p>
      {orders.length === 0 ? (
        <p className="p-4 text-sm text-muted">No supplier orders in this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-pine hover:underline" onClick={() => onOpen(order)}>
                      PO-{String(order.id).padStart(3, "0")}
                    </button>
                    <p className="text-xs text-muted">
                      {order.items.length === 1 ? "1 line" : `${order.items.length} lines`}
                    </p>
                  </td>
                  <td className="px-4 py-3">{order.supplierName}</td>
                  <td className="px-4 py-3">
                    <Badge tone={order.status === "received" ? "pine" : order.status === "cancelled" ? "neutral" : "brass"}>
                      {order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatWhen(order.orderedAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRwf(order.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function drugChoiceLabel(drug: Drug) {
  return `${drug.name} ${drug.strength} · ${drug.quantity} on hand`;
}

function DrugSearch({
  drugs,
  value,
  label,
  onChange,
}: {
  drugs: Drug[];
  value: string;
  label: string;
  onChange: (drugId: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = drugs.find((drug) => String(drug.id) === value);
  const needle = query.trim().toLowerCase();
  const matches = drugs
    .filter((drug) => {
      if (!needle) return true;
      return `${drug.name} ${drug.genericName} ${drug.strength} ${drug.sku} ${drug.category}`.toLowerCase().includes(needle);
    })
    .sort((left, right) => {
      if (!needle) return left.name.localeCompare(right.name);
      const rank = (drug: Drug) => (drug.name.toLowerCase().startsWith(needle) ? 0 : 1);
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    });

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const highlighted = matches.length === 0 ? 0 : Math.min(active, matches.length - 1);

  function choose(drug: Drug) {
    onChange(String(drug.id));
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={root} className="relative">
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search drugs"
        value={open ? query : selected ? drugChoiceLabel(selected) : ""}
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            const drug = matches[highlighted];
            if (drug) choose(drug);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-line bg-card shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No drugs match that search.</li>
          ) : (
            matches.map((drug, index) => (
              <li key={drug.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(drug.id) === value}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm ${
                    index === highlighted ? "bg-pine-soft" : "hover:bg-paper"
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(drug)}
                >
                  <span>
                    <span className="font-medium">{drug.name}</span>{" "}
                    <span className="text-muted">{drug.strength}</span>
                    <span className="block text-xs text-muted">{drug.sku}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">{drug.quantity} on hand</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function OrderDialog({
  lines,
  drugs,
  suppliers,
  supplierName,
  notes,
  error,
  pending,
  onSupplier,
  onSupplierCreated,
  onNotes,
  onLines,
  onClose,
  onSubmit,
}: {
  lines: OrderLine[] | null;
  drugs: Drug[];
  suppliers: string[];
  supplierName: string;
  notes: string;
  error: string | null;
  pending: boolean;
  onSupplier: (value: string) => void;
  onSupplierCreated: (name: string) => void;
  onNotes: (value: string) => void;
  onLines: (lines: OrderLine[] | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={lines !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Supplier order</DialogTitle>
          <DialogDescription>
            Placing the order does not change stock. Receive it when the boxes arrive. Unit cost is what you pay, not the shelf price.
          </DialogDescription>
        </DialogHeader>
        {lines ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {error ? <Notice>{error}</Notice> : null}
            <SupplierField
              label="Supplier"
              value={supplierName}
              suppliers={suppliers}
              canCreate
              required
              onChange={onSupplier}
              onCreated={onSupplierCreated}
            />
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
                <DrugSearch
                  drugs={drugs}
                  value={line.drugId}
                  label={`Order drug ${index + 1}`}
                  onChange={(drugId) =>
                    onLines(lines.map((item) => (item.key === line.key ? { ...item, drugId } : item)))
                  }
                />
                <div>
                  <Input
                    aria-label={`Order packs ${index + 1}`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) =>
                      onLines(lines.map((item) => (item.key === line.key ? { ...item, quantity: event.target.value } : item)))
                    }
                  />
                  {(() => {
                    const chosen = drugs.find((drug) => String(drug.id) === line.drugId);
                    const packs = wholeNumber(line.quantity);
                    if (!chosen || !packs) return <p className="mt-1 text-xs text-muted">Packs. Cost is per base unit.</p>;
                    return (
                      <p className="mt-1 text-xs text-muted">
                        {packs} {chosen.packUnit} = {packs * chosen.unitsPerPack} {chosen.baseUnit}s
                      </p>
                    );
                  })()}
                </div>
                <Input
                  aria-label={`Unit cost ${index + 1}`}
                  inputMode="numeric"
                  placeholder="Unit cost"
                  value={line.unitCost}
                  onChange={(event) =>
                    onLines(lines.map((item) => (item.key === line.key ? { ...item, unitCost: event.target.value } : item)))
                  }
                />
                <Input
                  aria-label={`New expiry ${index + 1}`}
                  type="date"
                  value={line.expiryDate}
                  onChange={(event) =>
                    onLines(lines.map((item) => (item.key === line.key ? { ...item, expiryDate: event.target.value } : item)))
                  }
                />
                <Input
                  aria-label={`Batch ${index + 1}`}
                  placeholder="New batch, if this delivery replaces the lot"
                  value={line.batchNumber}
                  onChange={(event) =>
                    onLines(lines.map((item) => (item.key === line.key ? { ...item, batchNumber: event.target.value } : item)))
                  }
                />
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() => onLines(lines.filter((item) => item.key !== line.key))}
                  >
                    Remove line
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="quiet" size="sm" onClick={() => onLines([...lines, blankOrderLine()])}>
              Add line
            </Button>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Notes</span>
              <Textarea value={notes} onChange={(event) => onNotes(event.target.value)} />
            </label>
            <DialogFooter>
              <Button type="submit" disabled={pending}>{pending ? "Placing…" : "Place order"}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function OrderDetail({
  order,
  pending,
  onClose,
  onReceive,
  onCancel,
}: {
  order: PurchaseOrder | null;
  pending: boolean;
  onClose: () => void;
  onReceive: (id: number) => void;
  onCancel: (id: number) => void;
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg">
        {order ? (
          <>
            <DialogHeader>
              <DialogTitle>
                PO-{String(order.id).padStart(3, "0")} · {order.supplierName}
              </DialogTitle>
              <DialogDescription>
                Placed by {order.orderedByName} · {formatWhen(order.orderedAt)}
                {order.receivedAt ? ` · received by ${order.receivedByName} ${formatWhen(order.receivedAt)}` : ""}
              </DialogDescription>
            </DialogHeader>
            <Badge tone={order.status === "received" ? "pine" : order.status === "cancelled" ? "neutral" : "brass"}>
              {order.status}
            </Badge>
            {order.notes ? <p className="mt-3 text-sm">{order.notes}</p> : null}
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {order.items.map((item) => (
                <li key={item.id} className="px-3 py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">
                      {item.drugName} <span className="font-normal text-muted">{item.strength}</span>
                    </p>
                    <p className="tabular-nums">{formatRwf(item.lineTotal)}</p>
                  </div>
                  <p className="mt-1 text-muted">
                    {item.quantity} × {formatRwf(item.unitCost)}
                    {item.batchNumber ? ` · batch ${item.batchNumber}` : ""}
                    {item.expiryDate ? ` · expiry ${formatDay(item.expiryDate)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {order.status === "ordered" ? (
              <DialogFooter>
                <Button variant="quiet" disabled={pending} onClick={() => onCancel(order.id)}>
                  Cancel order
                </Button>
                <Button disabled={pending} onClick={() => onReceive(order.id)}>
                  {pending ? "Receiving…" : "Receive and add to stock"}
                </Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
