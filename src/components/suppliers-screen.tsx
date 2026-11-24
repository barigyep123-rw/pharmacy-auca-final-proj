"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatRwf } from "@/lib/format";
import type { SupplierProfile } from "@/lib/suppliers";
import { useStaff } from "./session";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

const blank = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  taxNumber: "",
  terms: "",
  notes: "",
  active: true,
};

const paymentTerms = ["Pay on delivery", "Net 15 days", "Net 30 days", "Net 60 days"];

type FormState = typeof blank;

function fromProfile(supplier: SupplierProfile): FormState {
  return {
    name: supplier.name,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    taxNumber: supplier.taxNumber,
    terms: supplier.terms,
    notes: supplier.notes,
    active: supplier.active,
  };
}

export function SuppliersScreen() {
  const staff = useStaff();
  const canEdit = staff ? can(staff.role, "orders") : false;
  const [rows, setRows] = useState<SupplierProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SupplierProfile | "new" | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const result = await api<{ suppliers: SupplierProfile[] }>("/api/supplier-profiles");
    setRows(result.suppliers);
  }

  useEffect(() => {
    let cancel = false;
    api<{ suppliers: SupplierProfile[] }>("/api/supplier-profiles")
      .then((result) => {
        if (!cancel) setRows(result.suppliers);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load suppliers.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  function open(supplier: SupplierProfile) {
    setActive(supplier);
    setForm(fromProfile(supplier));
    setFormError(null);
  }

  function startCreate() {
    setActive("new");
    setForm(blank);
    setFormError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!active) return;
    setPending(true);
    setFormError(null);
    try {
      if (active === "new") {
        await api("/api/supplier-profiles", { method: "POST", body: JSON.stringify(form) });
        toast.success("Supplier added.");
      } else {
        await api(`/api/supplier-profiles/${active.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast.success("Supplier profile saved.");
      }
      setActive(null);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the supplier.");
    } finally {
      setPending(false);
    }
  }

  if (!rows && !error) return <LoadingBlock label="Opening supplier profiles…" />;
  if (!rows) return <Notice>{error}</Notice>;

  const creating = active === "new";

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier profiles"
        lede="Name, contact, address, and payment terms stay with the supplier. Invoices and orders keep a link to this record."
        action={canEdit ? <Button onClick={startCreate}>New supplier</Button> : undefined}
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            {canEdit
              ? "No suppliers yet. Add one here, or save a name on an order or invoice."
              : "No suppliers yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Terms</th>
                  <th className="px-4 py-3 font-medium">Invoices</th>
                  <th className="px-4 py-3 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((supplier) => (
                  <tr key={supplier.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{supplier.name}</p>
                      {supplier.address ? <p className="text-xs text-muted">{supplier.address}</p> : null}
                      {supplier.taxNumber ? <p className="text-xs text-muted">VAT {supplier.taxNumber}</p> : null}
                      {supplier.active ? null : <Badge tone="neutral">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <p>{supplier.contactName || "—"}</p>
                      <p className="text-xs text-muted">{supplier.phone || supplier.email || "No phone"}</p>
                    </td>
                    <td className="px-4 py-3">{supplier.terms || "—"}</td>
                    <td className="px-4 py-3">
                      {supplier.invoiceCount} · {formatRwf(supplier.openInvoiceTotal)} open
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="quiet" size="sm" onClick={() => open(supplier)}>
                        {canEdit ? "Edit" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={Boolean(active)} onOpenChange={(next) => { if (!next) setActive(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creating ? "New supplier" : form.name || "Supplier"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void save(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Name</span>
              <Input
                value={form.name}
                required
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Contact person</span>
              <Input
                value={form.contactName}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Phone</span>
              <Input
                value={form.phone}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Email</span>
              <Input
                type="email"
                value={form.email}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Physical address</span>
              <Input
                value={form.address}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Tax / VAT number</span>
              <Input
                value={form.taxNumber}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, taxNumber: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Payment terms</span>
              <Input
                list="payment-terms"
                placeholder="Pay on delivery, or net 30"
                value={form.terms}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))}
              />
              <datalist id="payment-terms">
                {paymentTerms.map((term) => (
                  <option key={term} value={term} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Notes</span>
              <Textarea
                value={form.notes}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                disabled={!canEdit}
                onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
              />
              Active
            </label>
            {canEdit ? (
              <DialogFooter>
                <Button type="button" variant="quiet" onClick={() => setActive(null)}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : creating ? "Add supplier" : "Save profile"}
                </Button>
              </DialogFooter>
            ) : (
              <p className="text-sm text-muted">Only an admin or stock keeper can change a supplier profile.</p>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
