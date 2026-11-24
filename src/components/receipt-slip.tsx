"use client";

import { useEffect, useRef, useState } from "react";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { formatRwf } from "@/lib/format";
import type { PaymentReceipt } from "@/lib/types";
import { PharmacyMark } from "./print-document";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type Shop = { name: string; phone: string; email: string; address: string; tin: string };

const fallbackShop: Shop = { name: pharmacyName, phone: "", email: "", address: pharmacyPlace, tin: "" };

function heading(numbers: string[]) {
  const list = numbers.filter(Boolean);
  if (list.length === 0) return "Receipt";
  if (list.length === 1) return list[0];
  return `${list[0]} – ${list[list.length - 1]}`;
}

function formatReceiptWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ReceiptPaper({
  receipt,
  shop,
  paperRef,
}: {
  receipt: PaymentReceipt;
  shop: Shop;
  paperRef?: React.Ref<HTMLElement>;
}) {
  const total = receipt.lines.reduce((sum, line) => sum + line.total, 0);
  const adjusted = receipt.lines.some((line) => line.unitPrice * line.quantity !== line.total);
  const customer = receipt.customerName.trim() || "Walk-in";
  return (
    <article
      ref={paperRef}
      style={{
        width: "74mm",
        padding: "2mm 1mm",
        background: "#fff",
        color: "#111",
        fontFamily: '"Source Sans 3", ui-sans-serif, sans-serif',
        fontSize: "12px",
        lineHeight: 1.35,
      }}
    >
      <header style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><PharmacyMark /></div>
        <p style={{ margin: 0, fontFamily: '"Source Serif 4", ui-serif, Georgia, serif', fontSize: "16px" }}>{shop.name}</p>
        {shop.address ? <p style={{ margin: "2px 0 0" }}>{shop.address}</p> : null}
        {shop.phone ? <p style={{ margin: 0 }}>{shop.phone}</p> : null}
        {shop.email ? <p style={{ margin: 0 }}>{shop.email}</p> : null}
        {shop.tin ? <p style={{ margin: 0 }}>TIN {shop.tin}</p> : null}
      </header>
      <p style={{ margin: "8px 0", borderTop: "1px dashed #111" }} />
      <p style={{ margin: 0, textAlign: "center", fontWeight: 700 }}>{heading(receipt.numbers)}</p>
      <p style={{ margin: "2px 0 0", textAlign: "center" }}>{formatReceiptWhen(receipt.issuedAt)}</p>
      <p style={{ margin: "6px 0 0" }}>Customer: {customer}</p>
      <p style={{ margin: "8px 0", borderTop: "1px dashed #111" }} />
      {receipt.lines.map((line, index) => (
        <div key={`${line.name}-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
          <p style={{ margin: 0 }}>{line.name}{line.strength ? ` ${line.strength}` : ""}</p>
          <p style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>{line.quantity} × {formatRwf(line.unitPrice)}</span>
            <span>{formatRwf(line.total)}</span>
          </p>
          {line.directions ? <p style={{ margin: 0 }}>{line.directions}</p> : null}
          {line.lotLabel ? <p style={{ margin: 0 }}>{line.lotLabel}</p> : null}
        </div>
      ))}
      <p style={{ margin: "8px 0", borderTop: "1px dashed #111" }} />
      <p style={{ margin: 0, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Total</span>
        <span>{formatRwf(total)}</span>
      </p>
      <p style={{ margin: "4px 0 0" }}>
        {receipt.paymentMethodName || "Payment"}
        {receipt.settlesImmediately ? "" : " · on account"}
      </p>
      {adjusted ? <p style={{ margin: "4px 0 0" }}>Totals include the pharmacy discount and tax.</p> : null}
      {receipt.sellerName ? <p style={{ margin: "4px 0 0" }}>Served by {receipt.sellerName}</p> : null}
      {receipt.fiscalNote ? <p style={{ margin: "6px 0 0", fontSize: "11px" }}>{receipt.fiscalNote}</p> : null}
      <p style={{ margin: "8px 0", borderTop: "1px dashed #111" }} />
      <p style={{ margin: 0, textAlign: "center" }}>Thank you</p>
    </article>
  );
}

export function printReceipt(node: HTMLElement) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const frame = iframe.contentWindow;
  const doc = frame?.document;
  if (!frame || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
    @page { size: 80mm auto; margin: 3mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
  </style></head><body>${node.outerHTML}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    frame.focus();
    frame.print();
    window.setTimeout(() => iframe.remove(), 1500);
  }, 150);
}

export function ReceiptDialog({
  receipt,
  onClose,
  preview = false,
}: {
  receipt: PaymentReceipt | null;
  onClose: () => void;
  preview?: boolean;
}) {
  const paperRef = useRef<HTMLElement>(null);
  const [shop, setShop] = useState<Shop>(fallbackShop);

  useEffect(() => {
    if (!receipt) return;
    let cancel = false;
    api<{ profile: Shop }>("/api/business")
      .then((result) => {
        if (!cancel) {
          setShop({
            name: result.profile.name,
            phone: result.profile.phone,
            email: result.profile.email,
            address: result.profile.address,
            tin: result.profile.tin,
          });
        }
      })
      .catch(() => {
        if (!cancel) setShop(fallbackShop);
      });
    return () => {
      cancel = true;
    };
  }, [receipt]);

  return (
    <Dialog open={Boolean(receipt)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        {receipt ? (
          <>
            <DialogHeader>
              <DialogTitle>{preview ? "Reprint preview" : "Receipt"}</DialogTitle>
              <DialogDescription>
                {preview
                  ? "This is how the 80mm slip will look. Nothing is sent to the printer."
                  : "An 80mm slip. Choose that paper width in the print dialog."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center rounded-xl bg-paper py-4">
              <ReceiptPaper receipt={receipt} shop={shop} paperRef={paperRef} />
            </div>
            <DialogFooter>
              <Button type="button" variant="quiet" onClick={onClose}>Close</Button>
              {preview ? null : (
                <Button
                  type="button"
                  onClick={() => {
                    if (paperRef.current) printReceipt(paperRef.current);
                  }}
                >
                  Print receipt
                </Button>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
