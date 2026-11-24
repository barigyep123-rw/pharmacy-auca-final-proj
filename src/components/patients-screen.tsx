"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { PatientSummary } from "@/lib/patients";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

export function PatientsScreen() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PatientSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const handle = window.setTimeout(() => {
      api<{ patients: PatientSummary[] }>(`/api/patients?q=${encodeURIComponent(query)}`)
        .then((result) => {
          if (!cancel) {
            setRows(result.patients);
            setError(null);
          }
        })
        .catch((caught: unknown) => {
          if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load patients.");
        });
    }, 200);
    return () => {
      cancel = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title="Patient records"
        lede="A person is opened the first time a prescription is filed in their name. History keeps every script and visit."
      />
      <label className="mb-4 block max-w-sm space-y-1.5">
        <span className="text-sm font-medium">Search</span>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" />
      </label>
      {!rows && !error ? <LoadingBlock label="Opening the patient list…" /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {rows ? (
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted">No patient matches that search. Filing a prescription creates the record.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Scripts</th>
                    <th className="px-4 py-3 font-medium">Last visit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((patient) => (
                    <tr key={patient.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <Link href={`/patients/${patient.id}`} className="font-medium text-pine underline">
                          {patient.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{patient.phone || "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{patient.prescriptionCount}</td>
                      <td className="px-4 py-3 text-muted">{patient.lastVisit ? formatWhen(patient.lastVisit) : "No visit yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
