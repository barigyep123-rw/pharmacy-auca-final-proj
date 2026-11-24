"use client";

import { useEffect, useRef, useState } from "react";
import { pharmacyName, pharmacyPlace } from "@/lib/brand";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

export type ShopProfile = {
  name: string;
  phone: string;
  email: string;
  address: string;
  tin: string;
};

const fallbackShop: ShopProfile = {
  name: pharmacyName,
  phone: "",
  email: "",
  address: pharmacyPlace,
  tin: "",
};

export function useShopProfile() {
  const [shop, setShop] = useState<ShopProfile>(fallbackShop);
  useEffect(() => {
    let cancel = false;
    api<{ profile: ShopProfile }>("/api/business")
      .then((result) => {
        if (!cancel) {
          setShop({
            name: result.profile.name || fallbackShop.name,
            phone: result.profile.phone || "",
            email: result.profile.email || "",
            address: result.profile.address || "",
            tin: result.profile.tin || "",
          });
        }
      })
      .catch(() => {
        if (!cancel) setShop(fallbackShop);
      });
    return () => {
      cancel = true;
    };
  }, []);
  return shop;
}

export function PharmacyMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#14324f" />
      <path d="M16 7v18M10 13h12" stroke="#fbf9f5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ShopLetterhead({ shop }: { shop: ShopProfile }) {
  return (
    <header style={{ display: "flex", gap: 12, alignItems: "flex-start", borderBottom: "1px solid #111", paddingBottom: 8 }}>
      <PharmacyMark />
      <div>
        <p style={{ margin: 0, fontFamily: '"Source Serif 4", ui-serif, Georgia, serif', fontSize: 18 }}>{shop.name}</p>
        {shop.address ? <p style={{ margin: "2px 0 0" }}>{shop.address}</p> : null}
        <p style={{ margin: "2px 0 0" }}>
          {[shop.phone, shop.email].filter(Boolean).join(" · ") || " "}
        </p>
        {shop.tin ? <p style={{ margin: "2px 0 0" }}>TIN {shop.tin}</p> : null}
      </div>
    </header>
  );
}

export function printDocument(node: HTMLElement, title: string) {
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
  doc.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    @page { size: A4; margin: 14mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
  </style></head><body>${node.outerHTML}</body></html>`);
  doc.close();
  window.setTimeout(() => {
    frame.focus();
    frame.print();
    window.setTimeout(() => iframe.remove(), 1500);
  }, 150);
}

export function DocumentDialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const paperRef = useRef<HTMLElement>(null);
  const shop = useShopProfile();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-xl bg-paper p-4">
          <article
            ref={paperRef}
            style={{
              width: "180mm",
              maxWidth: "100%",
              margin: "0 auto",
              background: "#fff",
              color: "#111",
              padding: "8mm",
              fontFamily: '"Source Sans 3", ui-sans-serif, sans-serif',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            <ShopLetterhead shop={shop} />
            {children}
          </article>
        </div>
        <DialogFooter>
          <Button type="button" variant="quiet" onClick={onClose}>Close</Button>
          <Button type="button" onClick={() => { if (paperRef.current) printDocument(paperRef.current, title); }}>
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
