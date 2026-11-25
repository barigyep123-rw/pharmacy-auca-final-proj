"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDay, formatRwf } from "@/lib/format";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type DayRow = { date: string; count: number; total: number; settled: number; onAccount: number };
type Report = { from: string; to: string; count: number; total: number; days: DayRow[] };

export function DayReport({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<Report>(`/api/reports/days?from=${from}&to=${to}`)
      .then((result) => {
        if (!cancel) {
          setData(result);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load sales by day.");
      });
    return () => {
      cancel = true;
    };
  }, [from, to]);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Sales by day"
        lede="Each Kigali day that had a sale, with settled money kept apart from credit."
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
      {!data && !error ? <LoadingBlock label="Grouping the days…" /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data ? (
        <Card className="overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-sm text-muted">
            {data.count.toLocaleString("en-RW")} sales · {formatRwf(data.total)}
          </p>
          {data.days.length === 0 ? (
            <p className="p-4 text-sm text-muted">No sales in that range.</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="scan-table w-full min-w-[36rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Day</th>
                    <th className="px-4 py-3 text-right font-medium">Sales</th>
                    <th className="px-4 py-3 text-right font-medium">Settled</th>
                    <th className="px-4 py-3 text-right font-medium">On account</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => (
                    <tr key={day.date} className="border-t border-line">
                      <td className="px-4 py-3">{formatDay(day.date)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{day.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRwf(day.settled)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRwf(day.onAccount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatRwf(day.total)}</td>
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
