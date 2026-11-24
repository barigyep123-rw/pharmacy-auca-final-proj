"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { compressPhoto } from "@/lib/compress-photo";
import { categorySuggestions, drugForms, wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf, formatWhen } from "@/lib/format";
import { describeStock } from "@/lib/units";
import type { Drug, Movement } from "@/lib/types";
import { useStaff } from "./session";
import { StockTools } from "./stock-tools";
import { mergeSupplierNames, SupplierField } from "./supplier-field";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type ShelfFilter = "all" | "low" | "expiring" | "expired";
type DrugDraft = {
  name: string;
  genericName: string;
  category: string;
  manufacturer: string;
  barcode: string;
  rxOnly: boolean;
  stripPrice: string;
  packPrice: string;
  form: string;
  strength: string;
  sku: string;
  unitPrice: string;
  openingQuantity: string;
  reorderLevel: string;
  baseUnit: string;
  packUnit: string;
  unitsPerPack: string;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
  photoData: string;
  clearPhoto: boolean;
};

const shelfFilters: Array<{ id: ShelfFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "low", label: "Low" },
  { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" },
];

function emptyDrug(reorderLevel = "10"): DrugDraft {
  return {
    name: "",
    genericName: "",
    category: "",
    manufacturer: "",
    barcode: "",
    rxOnly: false,
    stripPrice: "",
    packPrice: "",
    form: "tablet",
    strength: "",
    sku: "",
    unitPrice: "",
    openingQuantity: "0",
    reorderLevel,
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: "10",
    expiryDate: "",
    batchNumber: "",
    supplier: "",
    photoData: "",
    clearPhoto: false,
  };
}

function draftFromDrug(drug: Drug): DrugDraft {
  return {
    name: drug.name,
    genericName: drug.genericName,
    category: drug.category,
    manufacturer: drug.manufacturer,
    barcode: drug.barcode,
    rxOnly: drug.rxOnly,
    stripPrice: drug.stripPrice ? String(drug.stripPrice) : "",
    packPrice: drug.packPrice ? String(drug.packPrice) : "",
    form: drug.form,
    strength: drug.strength,
    sku: drug.sku,
    unitPrice: String(drug.unitPrice),
    openingQuantity: String(drug.quantity),
    reorderLevel: String(drug.reorderLevel),
    baseUnit: drug.baseUnit,
    packUnit: drug.packUnit,
    unitsPerPack: String(drug.unitsPerPack),
    expiryDate: drug.expiryDate,
    batchNumber: drug.batchNumber,
    supplier: drug.supplier,
    photoData: "",
    clearPhoto: false,
  };
}

function selectClass() {
  return "h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm";
}

async function readInventory() {
  const [catalog, saved, savedProfile] = await Promise.all([
    api<{ drugs: Drug[] }>("/api/drugs"),
    api<{ suppliers: string[] }>("/api/suppliers").catch(() => ({ suppliers: [] as string[] })),
    api<{ profile: { defaultReorderLevel: number } }>("/api/business").catch(() => null),
  ]);
  return {
    drugs: catalog.drugs,
    defaultReorder: savedProfile ? String(savedProfile.profile.defaultReorderLevel) : "10",
    suppliers: mergeSupplierNames([...saved.suppliers, ...catalog.drugs.map((drug) => drug.supplier)]),
  };
}

export function InventoryScreen() {
  const user = useStaff();
  const manageOrders = user ? can(user.role, "orders") : false;
  const removeDrugs = user ? can(user.role, "deleteDrug") : false;
  const [drugs, setDrugs] = useState<Drug[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [shelfFilter, setShelfFilter] = useState<ShelfFilter>("all");
  const [editing, setEditing] = useState<Drug | null | undefined>(undefined);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [defaultReorder, setDefaultReorder] = useState("10");

  async function load() {
    const next = await readInventory();
    setDrugs(next.drugs);
    setSuppliers(next.suppliers);
    setDefaultReorder(next.defaultReorder);
  }

  function rememberSupplier(name: string) {
    setSuppliers((current) => mergeSupplierNames([...current, name]));
  }

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    readInventory()
      .then((next) => {
        if (cancel) return;
        setDrugs(next.drugs);
        setSuppliers(next.suppliers);
        setDefaultReorder(next.defaultReorder);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load inventory.");
      });
    return () => {
      cancel = true;
    };
  }, [user]);

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

  if (!drugs && !error) return <LoadingBlock label="Reading the shelves…" />;
  if (!drugs) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Inventory"
        title="Shelf"
        lede="Sales and dispensing take stock off. A received supplier order, under Suppliers, puts it back."
        action={
          <Button
            onClick={() => {
              setFormError(null);
              setEditing(null);
            }}
          >
            Add drug
          </Button>
        }
      />

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

      <div className="mt-4">
        <StockTools drugs={drugs} />
      </div>

      <DrugDialog
        key={editing === undefined ? "closed" : editing ? String(editing.id) : "new"}
        open={editing !== undefined}
        drug={editing === undefined ? null : editing}
        suppliers={suppliers}
        canCreateSupplier={manageOrders}
        defaultReorder={defaultReorder}
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
          const unitsPerPack = wholeNumber(draft.unitsPerPack);
          if (!unitsPerPack || unitsPerPack < 1) {
            setFormError("Pack size has to be a whole number of base units.");
            setPending(false);
            return;
          }
          const body: Record<string, unknown> = {
            name: draft.name,
            genericName: draft.genericName,
            category: draft.category,
            brandName: draft.name,
            manufacturer: draft.manufacturer,
            barcode: draft.barcode,
            rxOnly: draft.rxOnly,
            stripPrice: wholeNumber(draft.stripPrice) ?? 0,
            packPrice: wholeNumber(draft.packPrice) ?? 0,
            form: draft.form,
            strength: draft.strength,
            sku: draft.sku,
            unitPrice,
            reorderLevel,
            expiryDate: draft.expiryDate,
            batchNumber: draft.batchNumber,
            supplier: draft.supplier,
            baseUnit: draft.baseUnit,
            packUnit: draft.packUnit,
            unitsPerPack,
          };
          if (draft.photoData) body.photo = draft.photoData;
          else if (editing && draft.clearPhoto) body.photo = null;
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
                      <div className="flex items-center gap-3">
                        {drug.hasPhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/drugs/${drug.id}/photo`}
                            alt=""
                            className="size-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : null}
                        <div>
                          <p className="font-medium">{drug.name}</p>
                          <p className="text-xs text-muted">
                            {drug.strength} {drug.form} · {drug.sku}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{describeStock(drug.quantity, drug.unitsPerPack, drug.baseUnit, drug.packUnit)}</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                          <span
                            className={`block h-full ${drug.low ? "bg-amber" : "bg-pine"}`}
                            style={{ width: `${width}%` }}
                          />
                        </span>
                        {drug.low ? <Badge tone="amber">Low</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {drug.allocated} allocated · reorder at {drug.reorderLevel} {drug.baseUnit}s
                      </p>
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
                          <Button variant="quiet" size="sm" asChild>
                            <Link href={`/suppliers/orders?drug=${drug.id}`}>Reorder</Link>
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

function DrugDialog({
  drug,
  open,
  suppliers,
  canCreateSupplier,
  defaultReorder,
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
  defaultReorder: string;
  error: string | null;
  pending: boolean;
  onSupplierCreated: (name: string) => void;
  onClose: () => void;
  onSubmit: (draft: DrugDraft) => void;
}) {
  const [draft, setDraft] = useState<DrugDraft>(() => (drug ? draftFromDrug(drug) : emptyDrug(defaultReorder)));
  const [movements, setMovements] = useState<Movement[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const existingPhoto = drug?.hasPhoto && !draft.clearPhoto ? `/api/drugs/${drug.id}/photo` : "";
  const preview = draft.photoData || existingPhoto;

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
          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium">Photo</span>
            <div className="flex items-center gap-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-16 rounded-lg object-cover" />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">
                  None
                </div>
              )}
              <div className="space-y-1">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
                  {preview ? "Change photo" : "Add photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setPhotoError(null);
                      void compressPhoto(file)
                        .then((photoData) => setDraft((current) => ({ ...current, photoData, clearPhoto: false })))
                        .catch((caught: unknown) => {
                          setPhotoError(caught instanceof Error ? caught.message : "Could not read that photo.");
                        });
                    }}
                  />
                </label>
                {preview ? (
                  <button
                    type="button"
                    className="block text-sm text-muted hover:text-ink"
                    onClick={() => setDraft((current) => ({ ...current, photoData: "", clearPhoto: true }))}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
            {photoError ? <p className="text-sm text-clay">{photoError}</p> : null}
          </div>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Name</span>
            <Input value={draft.name} onChange={(event) => set("name", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Generic</span>
            <Input value={draft.genericName} onChange={(event) => set("genericName", event.target.value)} placeholder="Links strengths and brands" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Manufacturer</span>
            <Input value={draft.manufacturer} onChange={(event) => set("manufacturer", event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Barcode</span>
            <Input value={draft.barcode} onChange={(event) => set("barcode", event.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={draft.rxOnly} onChange={(event) => set("rxOnly", event.target.checked)} />
            Prescription only. The counter cannot sell it without a filed script.
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
            <span className="text-sm font-medium">Base unit</span>
            <Input value={draft.baseUnit} onChange={(event) => set("baseUnit", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Pack</span>
            <Input value={draft.packUnit} onChange={(event) => set("packUnit", event.target.value)} required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Base units per pack</span>
            <Input inputMode="numeric" value={draft.unitsPerPack} onChange={(event) => set("unitsPerPack", event.target.value)} />
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
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Strip price (RWF)</span>
            <Input inputMode="numeric" value={draft.stripPrice} onChange={(event) => set("stripPrice", event.target.value)} placeholder="Optional" />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Box price (RWF)</span>
            <Input inputMode="numeric" value={draft.packPrice} onChange={(event) => set("packPrice", event.target.value)} placeholder="Optional" />
          </label>
          {drug ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">On hand</span>
              <p className="flex h-10 items-center text-sm tabular-nums">
                {describeStock(drug.quantity, drug.unitsPerPack, drug.baseUnit, drug.packUnit)}
              </p>
            </div>
          ) : (
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Opening quantity</span>
              <Input inputMode="numeric" value={draft.openingQuantity} onChange={(event) => set("openingQuantity", event.target.value)} />
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Reorder at (base units)</span>
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
