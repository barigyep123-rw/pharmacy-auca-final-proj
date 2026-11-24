"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { PatientHistory } from "@/lib/patients";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

export function PatientHistoryScreen({ id }: { id: number }) {
  const [record, setRecord] = useState<PatientHistory | null>(null);
  const [notes, setNotes] = useState("");
  const [allergies, setAllergies] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [preferredBrand, setPreferredBrand] = useState("");
  const [brandPreference, setBrandPreference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancel = false;
    api<PatientHistory>(`/api/patients/${id}`)
      .then((result) => {
        if (cancel) return;
        setRecord(result);
        setNotes(result.notes);
        setAllergies(result.allergies);
        setInsurerName(result.insurerName);
        setMemberNumber(result.memberNumber);
        setPreferredBrand(result.preferredBrand);
        setBrandPreference(result.brandPreference);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load this patient.");
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  async function saveNotes(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api<PatientHistory>(`/api/patients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes, allergies, insurerName, memberNumber, preferredBrand, brandPreference }),
      });
      setRecord(result);
      toast.success("Notes saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the notes.");
    } finally {
      setPending(false);
    }
  }

  if (!record && !error) return <LoadingBlock label="Opening the patient record…" />;
  if (!record) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title={record.name}
        lede={record.phone || "No phone on the record."}
      />
      <p className="mb-4 text-sm">
        <Link href="/patients" className="text-pine underline">All patients</Link>
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-serif text-xl">Prescriptions</h2>
            {record.prescriptions.length === 0 ? (
              <p className="p-4 text-sm text-muted">No prescriptions yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {record.prescriptions.map((script) => (
                  <li key={script.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{script.lines || "No drugs"}</p>
                      <Badge tone={script.status === "dispensed" ? "pine" : script.status === "cancelled" ? "neutral" : "amber"}>
                        {script.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted">
                      {script.doctorName || "No prescriber"} · filed {formatWhen(script.createdAt)} · {script.fillsUsed} of {1 + script.refillsAllowed} fills
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-serif text-xl">Visits</h2>
            {record.visits.length === 0 ? (
              <p className="p-4 text-sm text-muted">No fills or counter sales are tied to this patient yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {record.visits.map((visit, index) => (
                  <li key={`${visit.at}-${index}`} className="px-4 py-3 text-sm">
                    <p>{visit.summary}</p>
                    <p className="mt-1 text-muted">{formatWhen(visit.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="p-4">
          <h2 className="mb-3 font-serif text-xl">Notes</h2>
          <form className="space-y-3" onSubmit={(event) => void saveNotes(event)}>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
            <label className="block space-y-1.5 text-sm">
              Allergies
              <Input value={allergies} onChange={(event) => setAllergies(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              Insurer
              <Input value={insurerName} onChange={(event) => setInsurerName(event.target.value)} placeholder="RSSB, MMI, Mutuelle" />
            </label>
            <label className="block space-y-1.5 text-sm">
              Member number
              <Input value={memberNumber} onChange={(event) => setMemberNumber(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              Brand preference
              <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2" value={brandPreference} onChange={(event) => setBrandPreference(event.target.value)}>
                <option value="">No preference</option>
                <option value="any">Any brand</option>
                <option value="generic_only">Generic only</option>
                <option value="brand">A named brand</option>
              </select>
            </label>
            <label className="block space-y-1.5 text-sm">
              Preferred brand
              <Input value={preferredBrand} onChange={(event) => setPreferredBrand(event.target.value)} />
            </label>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
            <Button
              type="button"
              variant="quiet"
              disabled={pending || !record}
              onClick={() => {
                if (!record) return;
                const message = `Your medicine is ready at the pharmacy. Ask for ${record.name}.`;
                void api("/api/ready-notes", {
                  method: "POST",
                  body: JSON.stringify({ patientId: record.id, phone: record.phone, body: message }),
                })
                  .then(() => toast.success("Ready message saved. This build does not send SMS or WhatsApp."))
                  .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not save the message."));
              }}
            >
              Save a ready message
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
