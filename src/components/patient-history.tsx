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
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

export function PatientHistoryScreen({ id }: { id: number }) {
  const [record, setRecord] = useState<PatientHistory | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancel = false;
    api<PatientHistory>(`/api/patients/${id}`)
      .then((result) => {
        if (cancel) return;
        setRecord(result);
        setNotes(result.notes);
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
        body: JSON.stringify({ notes }),
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
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} />
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
