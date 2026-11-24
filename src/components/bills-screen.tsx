"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRwf, formatWhen } from "@/lib/format";
import type { PaymentReceipt, Sale } from "@/lib/types";
import { ReceiptDialog } from "./receipt-slip";
import { Card } from "./ui/card";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

function slipFromSale(sale: Sale): PaymentReceipt {
  return {
    numbers: sale.receiptNumber ? [sale.receiptNumber] : [],
    issuedAt: sale.createdAt,
    customerName: sale.customerName,
    sellerName: sale.sellerName,
    paymentMethodName: sale.paymentMethodName,
    settlesImmediately: sale.settlesImmediately,
    fiscalNote: sale.fiscalCode ? `Local fiscal mark ${sale.fiscalCode}. Not an RRA-signed EBM receipt.` : undefined,
    lines: [
      {
        name: sale.drugName,
        strength: sale.strength,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        total: sale.total,
        directions: sale.directions,
        lotLabel: sale.lotLabel,
      },
    ],
  };
}

export function BillsScreen() {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);

  useEffect(() => {
    let cancel = false;
    api<{ sales: Sale[] }>("/api/bills")
      .then((result) => {
        if (!cancel) setSales(result.sales);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load bills.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!sales && !error) return <LoadingBlock label="Opening bills…" />;
  if (!sales) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Counter"
        title="Bills"
        lede="Completed sales, with the drug, the customer, the tender, and a receipt you can print again."
      />
      <Card className="overflow-hidden">
        {sales.length === 0 ? (
          <p className="p-4 text-sm text-muted">No bills yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Drug</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-line">
                    <td className="px-4 py-3 text-muted">{formatWhen(sale.createdAt)}</td>
                    <td className="px-4 py-3">
                      {sale.drugName} <span className="text-muted">{sale.strength}</span>
                      {sale.directions ? <span className="mt-0.5 block text-xs text-muted">{sale.directions}</span> : null}
                      {sale.lotLabel ? <span className="mt-0.5 block text-xs text-muted">{sale.lotLabel}</span> : null}
                    </td>
                    <td className="px-4 py-3">{sale.customerName || "Walk-in"}</td>
                    <td className="px-4 py-3">
                      {sale.paymentMethodName || "—"}
                      {sale.receiptNumber ? <span className="block text-xs text-muted">{sale.receiptNumber}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRwf(sale.total)}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-sm text-pine hover:underline" onClick={() => setReceipt(slipFromSale(sale))}>
                        Reprint
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
