"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Package, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatDay, formatRwf, formatWhen } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

function party(name: string, prescriptionId: number | null) {
  if (prescriptionId) return `Prescription #${prescriptionId}`;
  return name || "Walk-in";
}

export function DashboardScreen({ eyebrow, title }: { eyebrow: string; title: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    api<DashboardData>("/api/dashboard")
      .then((result) => {
        if (!cancel) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!data && !error) return <LoadingBlock label="Counting the shelves…" />;
  if (!data) return <Notice>{error}</Notice>;

  const cards = [
    data.showInventory
      ? {
          label: "Catalog",
          value: String(data.totalDrugs),
          detail: `${data.totalUnits.toLocaleString("en-RW")} units on the shelf`,
          icon: Package,
        }
      : null,
    data.showInventory
      ? {
          label: "Low stock",
          value: String(data.lowStock),
          detail:
            data.showOrders && data.openOrderUnits > 0
              ? `${data.openOrderUnits.toLocaleString("en-RW")} units already on order`
              : "At or below the reorder line",
          icon: AlertTriangle,
        }
      : null,
    data.showSales
      ? {
          label: "Today's sales",
          value: formatRwf(data.todaySales.total),
          detail: `${data.todaySales.count} ${data.todaySales.count === 1 ? "sale" : "sales"} since midnight`,
          icon: Wallet,
        }
      : null,
    data.showPrescriptions
      ? {
          label: "Prescriptions",
          value: String(data.recentPrescriptionCount),
          detail: `${data.pendingPrescriptions} still waiting to dispense`,
          icon: ClipboardList,
        }
      : null,
  ].filter((card) => card !== null);

  return (
    <div>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        lede="The counter, limited to what your role can see."
      />
      {error ? <div className="mb-4"><Notice>{error}</Notice></div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-center justify-between text-muted">
              <p className="text-sm">{card.label}</p>
              <card.icon className="size-4 text-brass" />
            </div>
            <p className="mt-3 font-serif text-3xl tabular-nums tracking-tight">{card.value}</p>
            <p className="mt-1 text-sm text-muted">{card.detail}</p>
          </Card>
        ))}
      </div>

      <div className={`mt-6 grid gap-4 ${data.showInventory && data.showPrescriptions ? "lg:grid-cols-2" : ""}`}>
        {data.showInventory ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl">Needs a look</h2>
            <Link href="/inventory" className="text-sm text-pine hover:underline">
              Open inventory
            </Link>
          </div>
          {data.attention.length === 0 ? (
            <p className="text-sm text-muted">Nothing is low, expiring, or expired.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.attention.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {item.name} <span className="font-normal text-muted">{item.strength}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {item.quantity} on hand · reorder {item.reorderLevel} · {formatDay(item.expiryDate)}
                      {item.onOrder > 0 ? ` · ${item.onOrder} on order` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {item.expired ? <Badge tone="clay">Expired</Badge> : null}
                    {item.low ? <Badge tone="amber">Low</Badge> : null}
                    {!item.expired && item.expiringSoon ? <Badge tone="brass">Expiring</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        ) : null}

        {data.showPrescriptions ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl">Recent prescriptions</h2>
            <Link href="/prescriptions" className="text-sm text-pine hover:underline">
              Open prescriptions
            </Link>
          </div>
          {data.recentPrescriptions.length === 0 ? (
            <p className="text-sm text-muted">No prescriptions yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentPrescriptions.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{item.patientName}</p>
                    <p className="mt-1 text-xs text-muted">
                      {item.itemCount} {item.itemCount === 1 ? "drug" : "drugs"} · {formatWhen(item.createdAt)}
                    </p>
                  </div>
                  <Badge tone={item.status === "dispensed" ? "pine" : item.status === "cancelled" ? "neutral" : "amber"}>
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        ) : null}
      </div>

      {data.showSales ? (
      <Card className="mt-4 p-4">
        <h2 className="mb-3 font-serif text-xl">Today at the counter</h2>
        {data.recentSales.length === 0 ? (
          <p className="text-sm text-muted">No sales yet today. A walk-in or a dispensed prescription will show up here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Drug</th>
                  <th className="py-2 font-medium">For</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id} className="border-t border-line">
                    <td className="py-2.5 text-muted">{formatWhen(sale.createdAt)}</td>
                    <td className="py-2.5">
                      {sale.drugName} <span className="text-muted">{sale.strength}</span>
                    </td>
                    <td className="py-2.5">{party(sale.customerName, sale.prescriptionId)}</td>
                    <td className="py-2.5 text-right tabular-nums">{sale.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatRwf(sale.total)}</td>
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
