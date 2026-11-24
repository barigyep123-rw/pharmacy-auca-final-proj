"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRwf, formatWhen } from "@/lib/format";
import type { ReportSale } from "@/lib/reports";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Daily = {
  date: string;
  count: number;
  total: number;
  settled: number;
  onAccount: number;
  tenders: Array<{ name: string; total: number; count: number }>;
  sales: ReportSale[];
};

export function DailyReport({ initialDate }: { initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<Daily | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<Daily>(`/api/reports/daily?date=${date}`)
      .then((result) => {
        if (!cancel) {
          setData(result);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the daily report.");
      });
    return () => {
      cancel = true;
    };
  }, [date]);

  return (
    <div>
      <PageHeader
        eyebrow="Reports"
        title="Daily sales"
        lede="One day in Kigali time, with the takings split by how customers paid."
      />
      <label className="mb-4 block max-w-xs space-y-1.5">
        <span className="text-sm font-medium">Date</span>
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      {!data && !error ? <LoadingBlock label="Adding up the day…" /> : null}
      {error ? <Notice>{error}</Notice> : null}
      {data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-sm text-muted">Total</p>
              <p className="mt-2 font-serif text-3xl tabular-nums">{formatRwf(data.total)}</p>
              <p className="mt-1 text-xs text-muted">{data.count} {data.count === 1 ? "sale" : "sales"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">Settled</p>
              <p className="mt-2 font-serif text-3xl tabular-nums">{formatRwf(data.settled)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted">On account</p>
              <p className="mt-2 font-serif text-3xl tabular-nums">{formatRwf(data.onAccount)}</p>
            </Card>
          </div>
          <Card className="mb-4 p-4">
            <h2 className="mb-2 font-serif text-xl">By tender</h2>
            {data.tenders.length === 0 ? (
              <p className="text-sm text-muted">No sales on this day.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.tenders.map((tender) => (
                  <li key={tender.name} className="flex items-center justify-between py-2 text-sm">
                    <span>{tender.name} <span className="text-muted">· {tender.count}</span></span>
                    <span className="tabular-nums">{formatRwf(tender.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            {data.sales.length === 0 ? (
              <p className="p-4 text-sm text-muted">The counter was quiet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">Drug</th>
                      <th className="px-4 py-3 font-medium">Tender</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((sale) => (
                      <tr key={sale.id} className="border-t border-line">
                        <td className="px-4 py-3 text-muted">{formatWhen(sale.createdAt)}</td>
                        <td className="px-4 py-3">{sale.drugName} <span className="text-muted">{sale.strength}</span></td>
                        <td className="px-4 py-3">{sale.tenderName}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatRwf(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
