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
  terms: "",
  notes: "",
  active: true,
};

export function SuppliersScreen() {
  const staff = useStaff();
  const canEdit = staff ? can(staff.role, "orders") : false;
  const [rows, setRows] = useState<SupplierProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SupplierProfile | null>(null);
  const [form, setForm] = useState(blank);
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
    setForm({
      name: supplier.name,
      contactName: supplier.contactName,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      terms: supplier.terms,
      notes: supplier.notes,
      active: supplier.active,
    });
    setFormError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!active) return;
    setPending(true);
    setFormError(null);
    try {
      await api(`/api/supplier-profiles/${active.id}`, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Supplier profile saved.");
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

  return (
    <div>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier profiles"
        lede="Name, contact, and payment terms stay with the supplier. Invoices and orders keep a link to this record."
      />
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No suppliers yet. Saving a name on an order or invoice creates the profile.</p>
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
            <DialogTitle>{form.name || "Supplier"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void save(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            {(
              [
                ["name", "Name"],
                ["contactName", "Contact person"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
                ["terms", "Payment terms"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-sm font-medium">{label}</span>
                <Input
                  value={form[key]}
                  disabled={!canEdit}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
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
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
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
