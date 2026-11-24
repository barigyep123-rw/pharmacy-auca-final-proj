"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { formatDay, formatRwf } from "@/lib/format";
import { unitsFromOpeningPacks } from "@/lib/strength";
import { describeStock } from "@/lib/units";
import type { Drug } from "@/lib/types";
import { DrugDialog } from "./drug-dialog";
import { useStaff } from "./session";
import { StockTools } from "./stock-tools";
import { mergeSupplierNames } from "./supplier-field";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type ShelfFilter = "all" | "low" | "expiring" | "expired";

const shelfFilters: Array<{ id: ShelfFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "low", label: "Low" },
  { id: "expiring", label: "Expiring" },
  { id: "expired", label: "Expired" },
];

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
        catalog={drugs}
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
          if (draft.genericName.trim().length < 2) {
            setFormError("Choose a generic group, or type a new one.");
            setPending(false);
            return;
          }
          if (unitPrice == null || reorderLevel == null || (editing === null && openingQuantity == null)) {
            setFormError("Price, reorder level, and opening quantity need whole numbers.");
            setPending(false);
            return;
          }
          let unitsPerPack = wholeNumber(draft.unitsPerPack);
          if (!editing && openingQuantity && openingQuantity > 0) {
            const packs = wholeNumber(draft.openingPacks);
            const perPack = packs ? unitsFromOpeningPacks(openingQuantity, packs) : null;
            if (!perPack) {
              setFormError("Say how many packs that opening stock is. 20 tablets might be one blister or two, and the count has to divide evenly.");
              setPending(false);
              return;
            }
            unitsPerPack = perPack;
          }
          if (!unitsPerPack || unitsPerPack < 1) {
            setFormError("Pack size has to be a whole number of base units.");
            setPending(false);
            return;
          }
          const cover = (value: string) => {
            if (!draft.trackInsurance || value.trim() === "") return null;
            return wholeNumber(value);
          };
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
            strengthValue: draft.strengthValue,
            strengthUnit: draft.strengthUnit,
            description: draft.description,
            originCountry: draft.originCountry,
            rssbCover: cover(draft.rssbCover),
            mutuelleCover: cover(draft.mutuelleCover),
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
          if (!editing && draft.photos.length > 0) body.photos = draft.photos;
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
                          <span className="relative shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/drugs/${drug.id}/photo`}
                              alt=""
                              className="size-10 rounded-lg object-cover"
                            />
                            {drug.photoCount > 1 ? (
                              <span className="absolute -right-1 -bottom-1 rounded bg-ink px-1 text-[10px] text-paper-2">+{drug.photoCount - 1}</span>
                            ) : null}
                          </span>
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
