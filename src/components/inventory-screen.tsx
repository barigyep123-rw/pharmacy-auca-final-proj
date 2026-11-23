"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { categorySuggestions, drugForms, suggestedOrderQty, wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf, formatWhen } from "@/lib/format";
import type { Drug, Movement, PurchaseOrder } from "@/lib/types";
import { useStaff } from "./session";
import { mergeSupplierNames, SupplierField } from "./supplier-field";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Tab = "shelf" | "orders";
type ShelfFilter = "all" | "low" | "expiring" | "expired";
type OrderFilter = "all" | PurchaseOrder["status"];
type DrugDraft = {
  name: string;
  genericName: string;
  category: string;
  form: string;
  strength: string;
  sku: string;
  unitPrice: string;
  openingQuantity: string;
  reorderLevel: string;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
};
type OrderLine = {
  key: string;
  drugId: string;
  quantity: string;
  unitCost: string;
  expiryDate: string;
  batchNumber: string;
};

const shelfFilters: Array<{ id: ShelfFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "low", label: "Low" },
  { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" },
];

const orderFilters: Array<{ id: OrderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ordered", label: "Open" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
];

function emptyDrug(): DrugDraft {
  return {
    name: "",
    genericName: "",
    category: "",
    form: "tablet",
    strength: "",
    sku: "",
    unitPrice: "",
    openingQuantity: "0",
    reorderLevel: "10",
    expiryDate: "",
    batchNumber: "",
    supplier: "",
  };
}

function draftFromDrug(drug: Drug): DrugDraft {
  return {
    name: drug.name,
    genericName: drug.genericName,
    category: drug.category,
    form: drug.form,
    strength: drug.strength,
    sku: drug.sku,
    unitPrice: String(drug.unitPrice),
    openingQuantity: String(drug.quantity),
    reorderLevel: String(drug.reorderLevel),
    expiryDate: drug.expiryDate,
    batchNumber: drug.batchNumber,
    supplier: drug.supplier,
  };
}

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

function selectClass() {
  return "h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm";
}

async function readInventory(includeOrders: boolean) {
  const [catalog, purchase, saved] = await Promise.all([
    api<{ drugs: Drug[] }>("/api/drugs"),
    includeOrders
      ? api<{ orders: PurchaseOrder[] }>("/api/purchase-orders")
      : Promise.resolve({ orders: [] as PurchaseOrder[] }),
    api<{ suppliers: string[] }>("/api/suppliers").catch(() => ({ suppliers: [] as string[] })),
  ]);
  return {
    drugs: catalog.drugs,
    orders: purchase.orders,
    suppliers: mergeSupplierNames([
      ...saved.suppliers,
      ...catalog.drugs.map((drug) => drug.supplier),
      ...purchase.orders.map((order) => order.supplierName),
    ]),
  };
}

export function InventoryScreen() {
  const user = useStaff();
  const manageOrders = user ? can(user.role, "orders") : false;
  const removeDrugs = user ? can(user.role, "deleteDrug") : false;
  const [tab, setTab] = useState<Tab>("shelf");
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>("all");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [editing, setEditing] = useState<Drug | null | undefined>(undefined);
  const [ordering, setOrdering] = useState<OrderLine[] | null>(null);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const next = await readInventory(manageOrders);
    setDrugs(next.drugs);
    setOrders(next.orders);
    setSuppliers(next.suppliers);
  }

  function rememberSupplier(name: string) {
    setSuppliers((current) => mergeSupplierNames([...current, name]));
  }

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    readInventory(manageOrders)
      .then((next) => {
        if (cancel) return;
        setDrugs(next.drugs);
        setOrders(next.orders);
        setSuppliers(next.suppliers);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load inventory.");
      });
    return () => {
      cancel = true;
    };
  }, [user, manageOrders]);

  const visibleDrugs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (drugs ?? []).filter((drug) => {
      const matches = !needle || `${drug.name} ${drug.genericName} ${drug.sku} ${drug.category}`.toLowerCase().includes(needle);
      const status =
        shelfFilter === "all" ||
        (shelfFilter === "low" && drug.low) ||
        (shelfFilter === "expiring" && drug.expiringSoon) ||
        (shelfFilter === "expired" && drug.expired);
      return matches && status;
    });
  }, [drugs, search, shelfFilter]);

  const visibleOrders = (orders ?? []).filter((order) => orderFilter === "all" || order.status === orderFilter);

  function startReorder(drug: Drug) {
    setFormError(null);
    setSupplierName(drug.supplier);
    setOrderNotes("");
    setOrdering([
      blankOrderLine({
        drugId: String(drug.id),
        quantity: String(suggestedOrderQty(drug.quantity, drug.reorderLevel)),
      }),
    ]);
    setTab("orders");
  }

  if ((!drugs || !orders) && !error) return <LoadingBlock label="Reading the shelves…" />;
  if (!drugs || !orders) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Shelf and suppliers"
        lede="Quantities move in two directions: sales and dispensing take stock off, and a received supplier order puts it back."
        action={
          tab === "shelf" ? (
            <Button
              onClick={() => {
                setFormError(null);
                setEditing(null);
              }}
            >
              Add drug
            </Button>
          ) : (
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
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Inventory">
        {(
          [
            ["shelf", "Shelf"],
            ...(manageOrders
              ? [["orders", `Supplier orders (${(orders ?? []).filter((order) => order.status === "ordered").length} open)`] as const]
              : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === id ? "bg-pine text-paper-2" : "bg-card text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "shelf" ? (
        <Shelf
          drugs={visibleDrugs}
          search={search}
          filter={shelfFilter}
          canRemove={removeDrugs}
          canOrder={manageOrders}
          onSearch={setSearch}
          onFilter={setShelfFilter}
          onEdit={(drug) => {
            setFormError(null);
            setEditing(drug);
          }}
          onReorder={startReorder}
          onDelete={async (drug) => {
            if (!window.confirm(`Remove ${drug.name} from the catalog?`)) return;
            try {
              await api(`/api/drugs/${drug.id}`, { method: "DELETE" });
              toast.success(`${drug.name} removed.`);
              await load();
            } catch (caught) {
              toast.error(caught instanceof Error ? caught.message : "Could not remove the drug.");
            }
          }}
        />
      ) : (
        <Orders
          orders={visibleOrders}
          filter={orderFilter}
          onFilter={setOrderFilter}
          onOpen={setSelectedOrder}
        />
      )}

      <DrugDialog
        key={editing === undefined ? "closed" : editing ? String(editing.id) : "new"}
        open={editing !== undefined}
        drug={editing === undefined ? null : editing}
        suppliers={suppliers}
        canCreateSupplier={manageOrders}
        error={formError}
        pending={pending}
        onSupplierCreated={rememberSupplier}
        onClose={() => setEditing(undefined)}
        onSubmit={async (draft) => {
          setPending(true);
          setFormError(null);
          const unitPrice = wholeNumber(draft.unitPrice);
          const reorderLevel = wholeNumber(draft.reorderLevel);
          const openingQuantity = wholeNumber(draft.openingQuantity);
          if (unitPrice == null || reorderLevel == null || (editing === null && openingQuantity == null)) {
            setFormError("Price, reorder level, and opening quantity need whole numbers.");
            setPending(false);
            return;
          }
          const body = {
            name: draft.name,
            genericName: draft.genericName,
            category: draft.category,
            form: draft.form,
            strength: draft.strength,
            sku: draft.sku,
            unitPrice,
            reorderLevel,
            expiryDate: draft.expiryDate,
            batchNumber: draft.batchNumber,
            supplier: draft.supplier,
          };
          try {
            if (editing) {
              await api(`/api/drugs/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
              toast.success("Catalog updated. Quantity is unchanged.");
            } else {
              await api("/api/drugs", {
                method: "POST",
                body: JSON.stringify({ ...body, openingQuantity }),
              });
              toast.success("Drug added with its opening quantity.");
            }
            setEditing(undefined);
            await load();
          } catch (caught) {
            setFormError(caught instanceof Error ? caught.message : "Could not save the drug.");
          } finally {
            setPending(false);
          }
        }}
      />

      <OrderDialog
        lines={ordering}
        drugs={drugs}
        suppliers={suppliers}
        canCreateSupplier={manageOrders}
        supplierName={supplierName}
        notes={orderNotes}
        error={formError}
        pending={pending}
        onSupplier={setSupplierName}
        onSupplierCreated={rememberSupplier}
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
              quantity,
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

function Shelf({
  drugs,
  search,
  filter,
  canRemove,
  canOrder,
  onSearch,
  onFilter,
  onEdit,
  onReorder,
  onDelete,
}: {
  drugs: Drug[];
  search: string;
  filter: ShelfFilter;
  canRemove: boolean;
  canOrder: boolean;
  onSearch: (value: string) => void;
  onFilter: (value: ShelfFilter) => void;
  onEdit: (drug: Drug) => void;
  onReorder: (drug: Drug) => void;
  onDelete: (drug: Drug) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search name, generic, SKU"
          className="max-w-xs"
        />
        {shelfFilters.map((item) => (
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
      {drugs.length === 0 ? (
        <p className="p-4 text-sm text-muted">No drugs match this view.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Drug</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Expiry</th>
                <th className="px-4 py-3 font-medium">On order</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {drugs.map((drug) => {
                const cap = Math.max(drug.reorderLevel * 2, drug.quantity, 1);
                const width = Math.min(100, Math.round((drug.quantity / cap) * 100));
                return (
                  <tr key={drug.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{drug.name}</p>
                      <p className="text-xs text-muted">
                        {drug.strength} {drug.form} · {drug.sku}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-10 tabular-nums">{drug.quantity}</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                          <span
                            className={`block h-full ${drug.low ? "bg-amber" : "bg-pine"}`}
                            style={{ width: `${width}%` }}
                          />
                        </span>
                        {drug.low ? <Badge tone="amber">Low</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">Reorder at {drug.reorderLevel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{formatDay(drug.expiryDate)}</p>
                      {drug.expired ? <Badge tone="clay">Expired</Badge> : null}
                      {!drug.expired && drug.expiringSoon ? <Badge tone="brass">Soon</Badge> : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{drug.onOrder || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRwf(drug.unitPrice)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(drug)}>
                          Edit
                        </Button>
                        {canOrder ? (
                          <Button variant="quiet" size="sm" onClick={() => onReorder(drug)}>
                            Reorder
                          </Button>
                        ) : null}
                        {canRemove ? (
                          <Button variant="ghost" size="sm" onClick={() => onDelete(drug)}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
        An open order is a promise from the supplier. Receiving it is what increases the quantities on the shelf.
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

function DrugDialog({
  drug,
  open,
  suppliers,
  canCreateSupplier,
  error,
  pending,
  onSupplierCreated,
  onClose,
  onSubmit,
}: {
  drug: Drug | null;
  open: boolean;
  suppliers: string[];
  canCreateSupplier: boolean;
  error: string | null;
  pending: boolean;
  onSupplierCreated: (name: string) => void;
  onClose: () => void;
  onSubmit: (draft: DrugDraft) => void;
}) {
  const [draft, setDraft] = useState<DrugDraft>(() => (drug ? draftFromDrug(drug) : emptyDrug()));
  const [movements, setMovements] = useState<Movement[]>([]);

  useEffect(() => {
    if (!drug) return;
    let cancel = false;
    api<{ movements: Movement[] }>(`/api/drugs/${drug.id}`)
      .then((result) => {
        if (!cancel) setMovements(result.movements);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [drug]);

  function set<K extends keyof DrugDraft>(key: K, value: DrugDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{drug ? drug.name : "Add a drug"}</DialogTitle>
          <DialogDescription>
            {drug
              ? "Shelf quantity changes only when you sell, dispense, or receive a supplier order."
              : "Opening quantity is the stock you already have. Later changes go through sales or deliveries."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(draft);
          }}
        >
          {error ? <div className="sm:col-span-2"><Notice>{error}</Notice></div> : null}
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Name</span>
            <Input value={draft.name} onChange={(event) => set("name", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Generic</span>
            <Input value={draft.genericName} onChange={(event) => set("genericName", event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Category</span>
            <Input list="categories" value={draft.category} onChange={(event) => set("category", event.target.value)} required />
            <datalist id="categories">
              {categorySuggestions.map((category) => <option key={category} value={category} />)}
            </datalist>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Form</span>
            <select className={selectClass()} value={draft.form} onChange={(event) => set("form", event.target.value)}>
              {drugForms.map((form) => <option key={form} value={form}>{form}</option>)}
              {draft.form && !drugForms.includes(draft.form as (typeof drugForms)[number]) ? (
                <option value={draft.form}>{draft.form}</option>
              ) : null}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Strength</span>
            <Input value={draft.strength} onChange={(event) => set("strength", event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">SKU</span>
            <Input value={draft.sku} onChange={(event) => set("sku", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Selling price (RWF)</span>
            <Input
              inputMode="numeric"
              value={draft.unitPrice}
              onChange={(event) => set("unitPrice", event.target.value)}
            />
          </label>
          {drug ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">On hand</span>
              <p className="flex h-10 items-center text-sm tabular-nums">{drug.quantity}</p>
            </div>
          ) : (
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Opening quantity</span>
              <Input inputMode="numeric" value={draft.openingQuantity} onChange={(event) => set("openingQuantity", event.target.value)} />
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Reorder at</span>
            <Input inputMode="numeric" value={draft.reorderLevel} onChange={(event) => set("reorderLevel", event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Expiry</span>
            <Input type="date" value={draft.expiryDate} onChange={(event) => set("expiryDate", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Batch</span>
            <Input value={draft.batchNumber} onChange={(event) => set("batchNumber", event.target.value)} />
          </label>
          <SupplierField
            label="Usual supplier"
            value={draft.supplier}
            suppliers={suppliers}
            canCreate={canCreateSupplier}
            onChange={(value) => set("supplier", value)}
            onCreated={onSupplierCreated}
          />
          {movements.length > 0 ? (
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-medium">Recent movements</p>
              <ul className="space-y-1 text-sm text-muted">
                {movements.map((movement, index) => (
                  <li key={`${movement.at}-${index}`}>
                    {movement.kind === "receipt" ? "+" : "−"}
                    {movement.quantity} · {movement.detail} · {formatWhen(movement.at)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : drug ? "Save details" : "Add to catalog"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  canCreateSupplier,
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
  canCreateSupplier: boolean;
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
              canCreate={canCreateSupplier}
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
                <Input
                  aria-label={`Order quantity ${index + 1}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) =>
                    onLines(lines.map((item) => (item.key === line.key ? { ...item, quantity: event.target.value } : item)))
                  }
                />
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
