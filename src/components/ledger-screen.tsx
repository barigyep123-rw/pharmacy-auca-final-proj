"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRwf, formatWhen } from "@/lib/format";
import type { LedgerSale, TenderTotal } from "@/lib/finance";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Ledger = {
  tenders: TenderTotal[];
  settledTotal: number;
  onAccountTotal: number;
  moneyIn: number;
  moneyOut: number;
  sales: LedgerSale[];
};

const filters = ["All", "Cash", "Mobile money", "Card", "Credit"] as const;

export function LedgerScreen() {
  const [data, setData] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");

  useEffect(() => {
    let cancel = false;
    api<Ledger>("/api/finance/ledger")
      .then((result) => {
        if (!cancel) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the ledger.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!data && !error) return <LoadingBlock label="Opening the ledger…" />;
  if (!data) return <Notice>{error}</Notice>;

  const rows = data.sales.filter((sale) => filter === "All" || sale.tenderName === filter);

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Ledger"
        lede="Every sale, split by how it was paid. Money still on credit stays out of the cash total until it is collected."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.tenders.map((tender) => (
          <Card key={`${tender.kind}-${tender.name}`} className="p-4">
            <p className="text-sm text-muted">{tender.name}</p>
            <p className="mt-2 font-serif text-2xl tabular-nums">{formatRwf(tender.total)}</p>
            <p className="mt-1 text-xs text-muted">
              {tender.count} {tender.count === 1 ? "sale" : "sales"}
              {tender.onAccount > 0 ? ` · ${formatRwf(tender.onAccount)} on account` : ""}
            </p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-sm text-muted">Settled</p>
          <p className="mt-2 font-serif text-2xl tabular-nums">{formatRwf(data.settledTotal)}</p>
          <p className="mt-1 text-xs text-muted">{formatRwf(data.onAccountTotal)} still on account</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Money in minus money out</p>
          <p className="mt-2 font-serif text-2xl tabular-nums">{formatRwf(data.moneyIn - data.moneyOut)}</p>
          <p className="mt-1 text-xs text-muted">
            {formatRwf(data.moneyIn)} in · {formatRwf(data.moneyOut)} out
          </p>
        </Card>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full px-3 py-1 text-xs ${filter === item ? "bg-ink text-paper-2" : "bg-card text-muted"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">No sales for that tender yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Sale</th>
                  <th className="px-4 py-3 font-medium">Tender</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => (
                  <tr key={sale.id} className="border-t border-line">
                    <td className="px-4 py-3 text-muted">{formatWhen(sale.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{sale.drugName} <span className="font-normal text-muted">{sale.strength}</span></p>
                      <p className="text-xs text-muted">
                        {sale.receiptNumber || "No receipt"} · {sale.customerName || "Walk-in"} · {sale.quantity} sold
                      </p>
                    </td>
                    <td className="px-4 py-3">{sale.tenderName}</td>
                    <td className="px-4 py-3">
                      {sale.remaining > 0 ? (
                        <Badge tone="amber">{formatRwf(sale.remaining)} due</Badge>
                      ) : (
                        <Badge tone="pine">Settled</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRwf(sale.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
