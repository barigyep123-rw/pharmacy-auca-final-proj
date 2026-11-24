"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { AuditEntry } from "@/lib/audit";
import { Card } from "./ui/card";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

const filters = [
  { id: "", label: "All" },
  { id: "prescription", label: "Prescriptions" },
  { id: "sale", label: "Sales" },
  { id: "patient", label: "Patients" },
  { id: "drug", label: "Drugs" },
  { id: "order", label: "Orders" },
  { id: "supplier", label: "Suppliers" },
  { id: "invoice", label: "Invoices" },
  { id: "collection", label: "Collections" },
  { id: "staff", label: "Staff" },
  { id: "settings", label: "Settings" },
];

export function AuditScreen() {
  const [entity, setEntity] = useState("");
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<{ entries: AuditEntry[] }>(`/api/audit?entity=${encodeURIComponent(entity)}`)
      .then((result) => {
        if (!cancel) {
          setRows(result.entries);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the audit log.");
      });
    return () => {
      cancel = true;
    };
  }, [entity]);

  return (
    <div>
      <PageHeader
        eyebrow="Audit"
        title="Audit log"
        lede="Who changed a record, and when. Reads are not logged. New changes are recorded from the moment this log was turned on."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id || "all"}
            type="button"
            onClick={() => setEntity(filter.id)}
            className={`rounded-full px-3 py-1 text-sm ${entity === filter.id ? "bg-pine text-paper-2" : "bg-card text-muted"}`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {!rows && !error ? <LoadingBlock label="Reading the log…" /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {rows ? (
        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing in this view yet. A sale, script, or settings change will show up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Who</th>
                    <th className="px-4 py-3 font-medium">What</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id} className="border-t border-line">
                      <td className="px-4 py-3 text-muted">{formatWhen(entry.createdAt)}</td>
                      <td className="px-4 py-3">{entry.actorName}</td>
                      <td className="px-4 py-3">
                        <p>{entry.summary}</p>
                        <p className="text-xs text-muted">{entry.action} · {entry.entity}</p>
                        {entry.detail ? <p className="text-xs text-muted">{entry.detail}</p> : null}
                      </td>
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
