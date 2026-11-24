"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { wholeNumber } from "@/lib/catalog";
import { compressPhoto } from "@/lib/compress-photo";
import { formatRwf, formatWhen } from "@/lib/format";
import type { Drug, PaymentReceipt, Prescription } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { SearchableSelect } from "./searchable-select";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Line = { key: string; drugId: string; quantity: string; dosage: string };
type Filter = "all" | Prescription["status"];

const filters: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "dispensed", label: "Dispensed" },
  { id: "cancelled", label: "Cancelled" },
];

type Tender = { id: number; name: string; settlesImmediately: boolean };

function blankLine(): Line {
  return { key: crypto.randomUUID(), drugId: "", quantity: "1", dosage: "" };
}

function lineProblem(drug: Drug | undefined, quantity: number, today: string) {
  if (!drug) return "Choose a drug.";
  if (drug.expiryDate < today) return `${drug.name} is expired.`;
  if (drug.quantity < quantity) return `Only ${drug.quantity} ${drug.name} on hand.`;
  return null;
}

export function PrescriptionsScreen({ today }: { today: string }) {
  const [rows, setRows] = useState<Prescription[] | null>(null);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Prescription | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [facility, setFacility] = useState("");
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [photoData, setPhotoData] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [refillsAllowed, setRefillsAllowed] = useState("0");
  const [daysSupply, setDaysSupply] = useState("0");
  const [lines, setLines] = useState<Line[]>([{ key: "line-1", drugId: "", quantity: "1", dosage: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [methods, setMethods] = useState<Tender[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  async function load() {
    const [prescriptions, catalog, tenders] = await Promise.all([
      api<{ prescriptions: Prescription[] }>("/api/prescriptions"),
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ]);
    setRows(prescriptions.prescriptions);
    setDrugs(catalog.drugs);
    setMethods(tenders.methods);
    setPaymentMethodId((current) => current ?? tenders.methods[0]?.id ?? null);
    setActive((current) =>
      current ? prescriptions.prescriptions.find((item) => item.id === current.id) ?? null : null,
    );
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ prescriptions: Prescription[] }>("/api/prescriptions"),
      api<{ drugs: Drug[] }>("/api/drugs"),
      api<{ methods: Tender[] }>("/api/payment-methods?active=1"),
    ])
      .then(([prescriptions, catalog, tenders]) => {
        if (cancel) return;
        setRows(prescriptions.prescriptions);
        setDrugs(catalog.drugs);
        setMethods(tenders.methods);
        setPaymentMethodId((current) => current ?? tenders.methods[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load prescriptions.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const visible = (rows ?? []).filter((row) => filter === "all" || row.status === filter);

  function resetForm() {
    setPatientName("");
    setPatientPhone("");
    setDoctorName("");
    setFacility("");
    setPrescriptionNumber("");
    setPhotoData("");
    setPhotoError(null);
    setNotes("");
    setRefillsAllowed("0");
    setDaysSupply("0");
    setLines([{ key: "line-1", drugId: "", quantity: "1", dosage: "" }]);
    setFormError(null);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const items = [];
    for (const line of lines) {
      const drugId = Number(line.drugId);
      const quantity = wholeNumber(line.quantity);
      if (!drugId || !quantity) {
        setFormError("Each line needs a drug and a quantity.");
        return;
      }
      if (line.dosage.trim().length < 2) {
        setFormError("Add directions for each drug.");
        return;
      }
      items.push({ drugId, quantity, dosage: line.dosage.trim() });
    }
    setPending(true);
    try {
      await api("/api/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patientName,
          patientPhone,
          doctorName,
          facility,
          prescriptionNumber,
          notes,
          ...(photoData ? { photo: photoData } : {}),
          refillsAllowed: wholeNumber(refillsAllowed) ?? 0,
          daysSupply: wholeNumber(daysSupply) ?? 0,
          items,
        }),
      });
      toast.success("Prescription filed. Stock is unchanged until you dispense it.");
      setOpen(false);
      resetForm();
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not file the prescription.");
    } finally {
      setPending(false);
    }
  }

  async function dispense(id: number) {
    setPending(true);
    try {
      if (!paymentMethodId) {
        toast.error("Choose how the customer is paying.");
        setPending(false);
        return;
      }
      const result = await api<{ receipt: PaymentReceipt }>(`/api/prescriptions/${id}/dispense`, {
        method: "POST",
        body: JSON.stringify({ paymentMethodId }),
      });
      setActive(null);
      setReceipt(result.receipt);
      toast.success("Dispensed. The shelf quantities have been reduced.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not dispense.");
    } finally {
      setPending(false);
    }
  }

  async function refill(id: number) {
    setPending(true);
    try {
      if (!paymentMethodId) {
        toast.error("Choose how the customer is paying.");
        setPending(false);
        return;
      }
      const result = await api<{ receipt: PaymentReceipt }>(`/api/prescriptions/${id}/refill`, {
        method: "POST",
        body: JSON.stringify({ paymentMethodId }),
      });
      setActive(null);
      setReceipt(result.receipt);
      toast.success("Refill dispensed from the same prescription.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not refill.");
    } finally {
      setPending(false);
    }
  }

  async function cancel(id: number) {
    setPending(true);
    try {
      await api(`/api/prescriptions/${id}/cancel`, { method: "POST", body: "{}" });
      toast.success("Prescription cancelled. Stock was not touched.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not cancel.");
    } finally {
      setPending(false);
    }
  }

  if (!rows && !error) return <LoadingBlock label="Fetching prescriptions…" />;
  if (!rows) return <Notice>{error}</Notice>;

  const problems = active?.status === "pending"
    ? active.items
        .map((item) => lineProblem(drugs.find((drug) => drug.id === item.drugId), item.quantity, today))
        .filter((problem): problem is string => Boolean(problem))
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title="Prescriptions"
        lede="Filing a script does not move stock. Dispensing it does, in one step for every line."
        action={<Button onClick={() => setOpen(true)}>New prescription</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1 text-sm ${filter === item.id ? "bg-pine text-paper-2" : "bg-card text-muted"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted">No prescriptions in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Script</th>
                  <th className="px-4 py-3 font-medium">Prescriber</th>
                  <th className="px-4 py-3 font-medium">Filed</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.patientName}</p>
                      <p className="text-xs text-muted">
                        {row.items.length === 1 ? "1 line" : `${row.items.length} lines`}
                        {row.refillsAllowed > 0 ? ` · ${row.refillsRemaining} refill${row.refillsRemaining === 1 ? "" : "s"} left` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{row.prescriptionNumber || "—"}</p>
                      {row.hasPhoto ? <p className="text-xs text-muted">Photo attached</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <p>{row.doctorName || "—"}</p>
                      <p className="text-xs text-muted">{row.facility || "No facility"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatWhen(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === "dispensed" ? "pine" : row.status === "cancelled" ? "neutral" : "amber"}>
                        {row.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="quiet" size="sm" onClick={() => setActive(row)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New prescription</DialogTitle>
            <DialogDescription>Stock stays where it is until someone dispenses this.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void create(event)}>
            {formError ? <Notice>{formError}</Notice> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Patient</span>
                <Input value={patientName} onChange={(event) => setPatientName(event.target.value)} required />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Phone</span>
                <Input value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Prescription number</span>
                <Input value={prescriptionNumber} onChange={(event) => setPrescriptionNumber(event.target.value)} placeholder="RX-2291" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Hospital or facility</span>
                <Input value={facility} onChange={(event) => setFacility(event.target.value)} placeholder="CHUK" />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Prescriber</span>
                <Input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} />
              </label>
            </div>
            <div className="flex items-center gap-3">
              {photoData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoData} alt="Prescription" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line text-xs text-muted">
                  Photo
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
                {photoData ? "Change photo" : "Attach a photo"}
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
                      .then(setPhotoData)
                      .catch((caught: unknown) => {
                        setPhotoError(caught instanceof Error ? caught.message : "Could not read that photo.");
                      });
                  }}
                />
              </label>
              {photoData ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPhotoData("")}>
                  Remove photo
                </Button>
              ) : null}
            </div>
            {photoError ? <p className="text-sm text-clay">{photoError}</p> : null}
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={line.key} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_6rem_1fr_auto]">
                  <SearchableSelect
                    ariaLabel={`Drug ${index + 1}`}
                    value={line.drugId}
                    placeholder="Drug"
                    options={drugs.map((drug) => ({
                      value: String(drug.id),
                      label: `${drug.name} ${drug.strength} · ${drug.quantity} on hand`,
                    }))}
                    onChange={(value) =>
                      setLines((current) => current.map((item) => (item.key === line.key ? { ...item, drugId: value } : item)))
                    }
                  />
                  <Input
                    aria-label={`Quantity ${index + 1}`}
                    inputMode="numeric"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) => current.map((item) => (item.key === line.key ? { ...item, quantity: event.target.value } : item)))
                    }
                  />
                  <Input
                    aria-label={`Directions ${index + 1}`}
                    placeholder="Directions"
                    value={line.dosage}
                    onChange={(event) =>
                      setLines((current) => current.map((item) => (item.key === line.key ? { ...item, dosage: event.target.value } : item)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="quiet" size="sm" onClick={() => setLines((current) => [...current, blankLine()])}>
                Add drug
              </Button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Refills allowed</span>
              <Input
                inputMode="numeric"
                value={refillsAllowed}
                onChange={(event) => setRefillsAllowed(event.target.value)}
              />
              <span className="block text-xs text-muted">Extra fills after the first dispense. Zero means this script is used once.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Days this fill should last</span>
              <Input inputMode="numeric" value={daysSupply} onChange={(event) => setDaysSupply(event.target.value)} />
              <span className="block text-xs text-muted">A refill before this many days is refused as too soon. Zero does not block an early refill.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Notes</span>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <DialogFooter>
              <Button type="submit" disabled={pending}>{pending ? "Filing…" : "File prescription"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(active)} onOpenChange={(next) => { if (!next) setActive(null); }}>
        <DialogContent size="lg">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.patientName}</DialogTitle>
                <DialogDescription>
                  {active.prescriptionNumber || "No script number"}
                  {" · "}
                  {active.facility || "No facility"}
                  {" · "}
                  {active.doctorName || "No prescriber listed"}
                  {" · filed by "}
                  {active.createdByName}
                  {" · "}
                  {formatWhen(active.createdAt)}
                </DialogDescription>
              </DialogHeader>
              {active.hasPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/prescriptions/${active.id}/photo`}
                  alt={`Prescription ${active.prescriptionNumber || active.id}`}
                  className="mb-3 max-h-64 w-full rounded-xl object-contain bg-paper"
                />
              ) : null}
              <div className="mb-3 flex items-center gap-2">
                <Badge tone={active.status === "dispensed" ? "pine" : active.status === "cancelled" ? "neutral" : "amber"}>
                  {active.status}
                </Badge>
                {active.patientPhone ? <span className="text-sm text-muted">{active.patientPhone}</span> : null}
                <span className="text-sm text-muted">
                  {active.fillsUsed} of {1 + active.refillsAllowed} fills · {active.refillsRemaining} refill{active.refillsRemaining === 1 ? "" : "s"} left
                </span>
                {active.patientId ? (
                  <Link href={`/patients/${active.patientId}`} className="text-sm text-pine underline">
                    Patient history
                  </Link>
                ) : null}
              </div>
              {active.notes ? <p className="mb-3 text-sm">{active.notes}</p> : null}
              <ul className="divide-y divide-line rounded-xl border border-line">
                {active.items.map((item) => {
                  const problem = lineProblem(drugs.find((drug) => drug.id === item.drugId), item.quantity, today);
                  return (
                    <li key={item.id} className="px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">
                          {item.drugName} <span className="font-normal text-muted">{item.strength}</span>
                        </p>
                        <p className="tabular-nums">{item.quantity} × {formatRwf(item.unitPrice)}</p>
                      </div>
                      <p className="mt-1 text-muted">{item.dosage}</p>
                      {active.status === "pending" && problem ? <p className="mt-1 text-clay">{problem}</p> : null}
                    </li>
                  );
                })}
              </ul>
              {active.status === "pending" ? (
                <DialogFooter>
                  <label className="mr-auto flex items-center gap-2 text-sm">
                    <span className="text-muted">Payment</span>
                    <SearchableSelect
                      value={paymentMethodId == null ? "" : String(paymentMethodId)}
                      options={methods.map((method) => ({
                        value: String(method.id),
                        label: `${method.name}${method.settlesImmediately ? "" : " · on account"}`,
                      }))}
                      onChange={(value) => setPaymentMethodId(Number(value))}
                    />
                  </label>
                  <Button variant="quiet" disabled={pending} onClick={() => void cancel(active.id)}>
                    Cancel script
                  </Button>
                  <Button disabled={pending || problems.length > 0} onClick={() => void dispense(active.id)}>
                    {pending ? "Working…" : "Dispense and update stock"}
                  </Button>
                </DialogFooter>
              ) : null}
              {active.fills.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-muted">
                  {active.fills.map((fill) => (
                    <li key={fill.id}>
                      {fill.fillNumber === 1 ? "First fill" : `Refill ${fill.fillNumber - 1}`} by {fill.dispensedByName} · {formatWhen(fill.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {active.status === "dispensed" && active.refillsRemaining > 0 ? (
                <DialogFooter>
                  <label className="mr-auto flex items-center gap-2 text-sm">
                    <span className="text-muted">Payment</span>
                    <SearchableSelect
                      value={paymentMethodId == null ? "" : String(paymentMethodId)}
                      options={methods.map((method) => ({
                        value: String(method.id),
                        label: `${method.name}${method.settlesImmediately ? "" : " · on account"}`,
                      }))}
                      onChange={(value) => setPaymentMethodId(Number(value))}
                    />
                  </label>
                  <Button disabled={pending} onClick={() => void refill(active.id)}>
                    {pending ? "Working…" : "Dispense refill"}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
