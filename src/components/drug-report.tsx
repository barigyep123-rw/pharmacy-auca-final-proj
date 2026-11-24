"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRwf } from "@/lib/format";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type DrugRow = { id: number; name: string; strength: string; quantity: number; total: number };
type Report = { from: string; to: string; quantity: number; total: number; drugs: DrugRow[] };

export function DrugReport({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<Report>(`/api/reports/drugs?from=${from}&to=${to}`)
      .then((result) => {
        if (!cancel) {
          setData(result);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load sales by drug.");
      });
    return () => {
      cancel = true;
    };
  }, [from, to]);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Sales by drug"
        lede="Which packs left the shelf, and what they brought in, between two dates."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">From</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">To</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {!data && !error ? <LoadingBlock label="Grouping the drugs…" /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data ? (
        <Card className="overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-sm text-muted">
            {data.quantity.toLocaleString("en-RW")} units · {formatRwf(data.total)}
          </p>
          {data.drugs.length === 0 ? (
            <p className="p-4 text-sm text-muted">No sales in that range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Drug</th>
                    <th className="px-4 py-3 text-right font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drugs.map((drug) => (
                    <tr key={drug.id} className="border-t border-line">
                      <td className="px-4 py-3">{drug.name} <span className="text-muted">{drug.strength}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{drug.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRwf(drug.total)}</td>
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
