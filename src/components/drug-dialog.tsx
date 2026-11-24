"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { categorySuggestions, drugForms } from "@/lib/catalog";
import { countries } from "@/lib/countries";
import { compressPhoto } from "@/lib/compress-photo";
import { strengthUnits } from "@/lib/strength";
import { formatWhen } from "@/lib/format";
import { describeStock } from "@/lib/units";
import type { CatalogUnit } from "@/lib/units-catalog";
import type { Drug, Movement } from "@/lib/types";
import { BrandPhotos } from "./brand-photos";
import { FieldHint } from "./field-hint";
import { SearchableSelect } from "./searchable-select";
import { SupplierField } from "./supplier-field";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Notice } from "./ui/chrome";

export type DrugDraft = {
  name: string;
  genericName: string;
  category: string;
  manufacturer: string;
  barcode: string;
  rxOnly: boolean;
  stripPrice: string;
  packPrice: string;
  form: string;
  strengthValue: string;
  strengthUnit: string;
  description: string;
  originCountry: string;
  trackInsurance: boolean;
  rssbCover: string;
  mutuelleCover: string;
  sku: string;
  unitPrice: string;
  openingQuantity: string;
  openingPacks: string;
  reorderLevel: string;
  baseUnit: string;
  packUnit: string;
  unitsPerPack: string;
  expiryDate: string;
  batchNumber: string;
  supplier: string;
  photos: string[];
};

const steps = ["Identity and pricing", "Stock and supplier", "Photos"] as const;

const fallbackBase = ["tablet", "capsule", "sachet", "bottle", "tube", "inhaler"];
const fallbackPack = ["box", "blister", "strip", "carton"];

export function emptyDrug(reorderLevel = "10"): DrugDraft {
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
    strengthValue: "",
    strengthUnit: "mg",
    description: "",
    originCountry: "",
    trackInsurance: false,
    rssbCover: "",
    mutuelleCover: "",
    sku: "",
    unitPrice: "",
    openingQuantity: "0",
    openingPacks: "",
    reorderLevel,
    baseUnit: "tablet",
    packUnit: "box",
    unitsPerPack: "10",
    expiryDate: "",
    batchNumber: "",
    supplier: "",
    photos: [],
  };
}

export function draftFromDrug(drug: Drug): DrugDraft {
  return {
    ...emptyDrug(String(drug.reorderLevel)),
    name: drug.name,
    genericName: drug.genericName,
    category: drug.category,
    manufacturer: drug.manufacturer,
    barcode: drug.barcode,
    rxOnly: drug.rxOnly,
    stripPrice: drug.stripPrice ? String(drug.stripPrice) : "",
    packPrice: drug.packPrice ? String(drug.packPrice) : "",
    form: drug.form,
    strengthValue: drug.strengthValue,
    strengthUnit: drug.strengthUnit || "mg",
    description: drug.description,
    originCountry: drug.originCountry,
    trackInsurance: drug.rssbCover != null || drug.mutuelleCover != null,
    rssbCover: drug.rssbCover == null ? "" : String(drug.rssbCover),
    mutuelleCover: drug.mutuelleCover == null ? "" : String(drug.mutuelleCover),
    sku: drug.sku,
    unitPrice: String(drug.unitPrice),
    openingQuantity: String(drug.quantity),
    baseUnit: drug.baseUnit,
    packUnit: drug.packUnit,
    unitsPerPack: String(drug.unitsPerPack),
    expiryDate: drug.expiryDate,
    batchNumber: drug.batchNumber,
    supplier: drug.supplier,
  };
}

function copyFrom(source: Drug, current: DrugDraft, keepSku: boolean): DrugDraft {
  const next = draftFromDrug(source);
  return {
    ...next,
    sku: keepSku ? current.sku : "",
    openingQuantity: current.openingQuantity,
    openingPacks: current.openingPacks,
    photos: current.photos,
  };
}

export function DrugDialog({
  drug,
  open,
  suppliers,
  catalog,
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
  catalog: Drug[];
  canCreateSupplier: boolean;
  defaultReorder: string;
  error: string | null;
  pending: boolean;
  onSupplierCreated: (name: string) => void;
  onClose: () => void;
  onSubmit: (draft: DrugDraft) => void;
}) {
  const [draft, setDraft] = useState<DrugDraft>(() => (drug ? draftFromDrug(drug) : emptyDrug(defaultReorder)));
  const [step, setStep] = useState(0);
  const [generics, setGenerics] = useState<string[]>([]);
  const [units, setUnits] = useState<CatalogUnit[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancel = false;
    api<{ generics: string[] }>("/api/generics")
      .then((result) => {
        if (!cancel) setGenerics(result.generics);
      })
      .catch(() => undefined);
    api<{ units: CatalogUnit[] }>("/api/catalog-units")
      .then((result) => {
        if (!cancel) setUnits(result.units);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

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

  const typedGeneric = draft.genericName.trim();
  const knownGeneric = generics.some((name) => name.toLowerCase() === typedGeneric.toLowerCase());
  const baseOptions = uniqueOptions(units.filter((unit) => unit.kind === "base").map((unit) => unit.name), fallbackBase, draft.baseUnit);
  const packOptions = uniqueOptions(units.filter((unit) => unit.kind === "pack").map((unit) => unit.name), fallbackPack, draft.packUnit);
  const formOptions = uniqueOptions([...drugForms], [], draft.form);

  function applyMatch(source: Drug) {
    setDraft((current) => copyFrom(source, current, Boolean(drug)));
    setCopied(source.name);
  }

  function lookupBarcode() {
    const code = draft.barcode.trim().toLowerCase();
    if (code.length < 3) return;
    const match = catalog.find((item) => item.id !== drug?.id && item.barcode.toLowerCase() === code);
    if (match) applyMatch(match);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{drug ? drug.name : "Add a drug"}</DialogTitle>
          <DialogDescription>
            {steps[step]}. {step + 1} of {steps.length}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 text-xs">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`rounded-full px-2 py-1 ${index === step ? "bg-pine text-paper-2" : "bg-card text-muted"}`}
              onClick={() => setStep(index)}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (step < steps.length - 1) {
              setStep(step + 1);
              return;
            }
            onSubmit(draft);
          }}
        >
          {error ? <div className="sm:col-span-2"><Notice>{error}</Notice></div> : null}
          {step === 0 ? (
            <>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Copy from a drug on the shelf</span>
                <SearchableSelect
                  value=""
                  placeholder={copied ? `Copied ${copied}` : "Search a similar brand"}
                  options={catalog.map((item) => ({
                    value: String(item.id),
                    label: `${item.brandName || item.name} ${item.strength}`.trim(),
                  }))}
                  onChange={(value) => {
                    const source = catalog.find((item) => String(item.id) === value);
                    if (source) applyMatch(source);
                  }}
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Name</span>
                <Input value={draft.name} onChange={(event) => set("name", event.target.value)} required />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Generic group</span>
                <Input list="generic-groups" value={draft.genericName} onChange={(event) => set("genericName", event.target.value)} placeholder="Paracetamol" required />
                <datalist id="generic-groups">
                  {generics.map((name) => <option key={name} value={name} />)}
                </datalist>
                <span className="block text-xs text-muted">
                  {typedGeneric.length >= 2 && !knownGeneric
                    ? `${typedGeneric} will be added as a new generic group when you save.`
                    : "Required. Pick a group such as paracetamol, or type a new one."}
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Barcode</span>
                <Input
                  value={draft.barcode}
                  onChange={(event) => set("barcode", event.target.value)}
                  onBlur={lookupBarcode}
                  placeholder="Scan or type, then leave the field"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Manufacturer</span>
                <Input value={draft.manufacturer} onChange={(event) => set("manufacturer", event.target.value)} />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Country of origin</span>
                <SearchableSelect
                  value={draft.originCountry}
                  placeholder="Where it was made"
                  options={countries.map((country) => ({ value: country, label: country }))}
                  onChange={(value) => set("originCountry", value)}
                />
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
                <SearchableSelect
                  value={draft.form}
                  options={formOptions.map((form) => ({ value: form, label: form }))}
                  onChange={(value) => set("form", value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Strength
                  <FieldHint label="About strength" text="How much medicine is in one base unit. Example: 200 and mg, which is stored as 200 mg, not 200mg or 0.2 g." />
                </span>
                <Input inputMode="decimal" value={draft.strengthValue} onChange={(event) => set("strengthValue", event.target.value)} placeholder="200" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Strength unit</span>
                <SearchableSelect
                  value={draft.strengthUnit}
                  options={strengthUnits.map((unit) => ({ value: unit, label: unit }))}
                  onChange={(value) => set("strengthUnit", value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">SKU</span>
                <Input value={draft.sku} onChange={(event) => set("sku", event.target.value)} required />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Selling price (RWF)</span>
                <Input inputMode="numeric" value={draft.unitPrice} onChange={(event) => set("unitPrice", event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Strip price (RWF)</span>
                <Input inputMode="numeric" value={draft.stripPrice} onChange={(event) => set("stripPrice", event.target.value)} placeholder="Optional" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Box price (RWF)</span>
                <Input inputMode="numeric" value={draft.packPrice} onChange={(event) => set("packPrice", event.target.value)} placeholder="Optional" />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Description</span>
                <textarea
                  className="min-h-20 w-full rounded-lg border border-line bg-paper-2 px-2 py-2 text-sm"
                  value={draft.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="What the box is for, in plain language."
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={draft.rxOnly} onChange={(event) => set("rxOnly", event.target.checked)} />
                Prescription only. The counter cannot sell it without a filed script.
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={draft.trackInsurance} onChange={(event) => set("trackInsurance", event.target.checked)} />
                Set RSSB and Mutuelle coverage for this drug
              </label>
              {draft.trackInsurance ? (
                <>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">RSSB covers (%)</span>
                    <Input inputMode="numeric" value={draft.rssbCover} onChange={(event) => set("rssbCover", event.target.value)} placeholder="85" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Mutuelle covers (%)</span>
                    <Input inputMode="numeric" value={draft.mutuelleCover} onChange={(event) => set("mutuelleCover", event.target.value)} placeholder="0" />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {step === 1 ? (
            <>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Base unit
                  <FieldHint label="About the base unit" text="The smallest thing you count. Example: one tablet, not the box it came in." />
                </span>
                <SearchableSelect value={draft.baseUnit} options={baseOptions.map((name) => ({ value: name, label: name }))} onChange={(value) => set("baseUnit", value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Pack
                  <FieldHint label="About the pack" text="The package those units come in. Example: a blister of tablets, or a box of bottles." />
                </span>
                <SearchableSelect value={draft.packUnit} options={packOptions.map((name) => ({ value: name, label: name }))} onChange={(value) => set("packUnit", value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">
                  Base units per pack
                  <FieldHint label="About units per pack" text="How many base units are in one pack. Example: 10 tablets in one blister." />
                </span>
                <Input inputMode="numeric" value={draft.unitsPerPack} onChange={(event) => set("unitsPerPack", event.target.value)} />
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
              {!drug && Number(draft.openingQuantity) > 0 ? (
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">
                    How many packs is that?
                    <FieldHint label="About opening packs" text="20 tablets might be one blister pack or two. The shelf keeps both the tablet count and the pack count." />
                  </span>
                  <Input inputMode="numeric" value={draft.openingPacks} onChange={(event) => set("openingPacks", event.target.value)} placeholder="1" />
                </label>
              ) : null}
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
            </>
          ) : null}
          {step === 2 ? (
            drug ? <BrandPhotos drugId={drug.id} /> : (
              <div className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium">Packaging photos</span>
                <p className="text-xs text-muted">Up to six pictures of the box.</p>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.photos.map((photo, index) => (
                    <div key={photo.slice(0, 32) + index} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt="" className="size-16 rounded-lg object-cover" />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 rounded-full bg-ink px-1.5 text-[10px] text-paper-2"
                        onClick={() => setDraft((current) => ({ ...current, photos: current.photos.filter((_, item) => item !== index) }))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
                    Add photo
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
                          .then((photo) => setDraft((current) => ({ ...current, photos: [...current.photos, photo].slice(0, 6) })))
                          .catch((caught: unknown) => setPhotoError(caught instanceof Error ? caught.message : "Could not read that photo."));
                      }}
                    />
                  </label>
                </div>
                {photoError ? <p className="text-sm text-clay">{photoError}</p> : null}
              </div>
            )
          ) : null}
          <DialogFooter className="sm:col-span-2">
            {step > 0 ? (
              <Button type="button" variant="quiet" onClick={() => setStep(step - 1)}>Back</Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              {step < steps.length - 1 ? "Next" : pending ? "Saving…" : drug ? "Save details" : "Add to catalog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function uniqueOptions(primary: string[], extra: string[], current: string) {
  const values = [...primary, ...extra, current].map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)];
}
