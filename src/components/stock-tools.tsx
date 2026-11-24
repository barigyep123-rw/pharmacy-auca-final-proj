"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Drug } from "@/lib/types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";

type Lot = { id: number; lotNumber: string; expiryDate: string; quantity: number; expired: boolean };
type CountLine = { drugId: number; name: string; strength: string; expected: number; counted: number };

export function StockTools({ drugs }: { drugs: Drug[] }) {
  const [drugId, setDrugId] = useState<number | "">(drugs[0]?.id ?? "");
  const [kind, setKind] = useState<"return_restock" | "return_dispose" | "damaged" | "expired">("damaged");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [sheet, setSheet] = useState<CountLine[] | null>(null);
  const [shift, setShift] = useState<{ openedBy: string } | null>(null);
  const [countedCash, setCountedCash] = useState("");

  useEffect(() => {
    if (!drugId) return;
    let cancel = false;
    api<{ lots: Lot[] }>(`/api/drugs/${drugId}/lots`)
      .then((result) => {
        if (!cancel) setLots(result.lots);
      })
      .catch(() => {
        if (!cancel) setLots([]);
      });
    return () => {
      cancel = true;
    };
  }, [drugId]);

  useEffect(() => {
    api<{ shift: { openedBy: string } | null }>("/api/till")
      .then((result) => setShift(result.shift))
      .catch(() => setShift(null));
    api<{ stocktake: { lines: CountLine[] } | null }>("/api/stocktakes")
      .then((result) => setSheet(result.stocktake?.lines ?? null))
      .catch(() => setSheet(null));
  }, []);

  async function adjust(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api("/api/adjustments", {
        method: "POST",
        body: JSON.stringify({
          drugId: Number(drugId),
          kind,
          quantity: Number(quantity),
          reason,
          lotNumber,
          expiryDate,
        }),
      });
      toast.success(kind === "return_dispose" ? "Return recorded. Stock stays off the shelf." : "Stock updated.");
      setReason("");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not record that movement.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-3 font-serif text-xl">Returns and write-offs</h2>
        <form className="space-y-3" onSubmit={(event) => void adjust(event)}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Drug</span>
            <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={drugId} onChange={(event) => setDrugId(Number(event.target.value))}>
              {drugs.map((drug) => (
                <option key={drug.id} value={drug.id}>{drug.name} {drug.strength}</option>
              ))}
            </select>
          </label>
          {lots.length > 0 ? (
            <p className="text-xs text-muted">
              Lots, earliest expiry first: {lots.map((lot) => `${lot.lotNumber || "Lot"} ${lot.expiryDate} (${lot.quantity}${lot.expired ? ", expired" : ""})`).join("; ")}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What happened</span>
            <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="return_restock">Customer return, put back on the shelf</option>
              <option value="return_dispose">Customer return, do not restock</option>
              <option value="damaged">Damaged, write off</option>
              <option value="expired">Expired, write off</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Quantity</span>
              <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Lot</span>
              <Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
            </label>
          </div>
          {kind === "return_restock" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Expiry of the returned lot</span>
              <Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
            </label>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Why</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} required />
          </label>
          <Button type="submit">Record movement</Button>
        </form>
      </Card>
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="mb-2 font-serif text-xl">Till</h2>
          <p className="mb-2 text-sm text-muted">{shift ? `Open, started by ${shift.openedBy}.` : "No shift is open."}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => void api("/api/till", { method: "POST", body: JSON.stringify({ action: "open" }) }).then(() => api<{ shift: { openedBy: string } | null }>("/api/till")).then((result) => setShift(result.shift)).catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not open the till."))}>
              Open shift
            </Button>
            <Input className="w-32" inputMode="numeric" placeholder="Counted cash" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} />
            <Button
              onClick={() =>
                void api<{ variance: number }>("/api/till", {
                  method: "POST",
                  body: JSON.stringify({ action: "close", countedCash: Number(countedCash) || 0, note: "" }),
                })
                  .then((result) => {
                    toast.success(`Shift closed. Difference ${result.variance} RWF.`);
                    setShift(null);
                  })
                  .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not close the till."))
              }
            >
              Close shift
            </Button>
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-serif text-xl">Stocktake</h2>
          <Button
            variant="quiet"
            onClick={() =>
              void api<{ stocktake: { lines: CountLine[] } | null }>("/api/stocktakes", {
                method: "POST",
                body: JSON.stringify({ action: "start" }),
              }).then((result) => setSheet(result.stocktake?.lines ?? null))
            }
          >
            Start a count
          </Button>
          {sheet ? (
            <div className="mt-3 space-y-2">
              {sheet.slice(0, 6).map((line) => (
                <label key={line.drugId} className="flex items-center justify-between gap-2 text-sm">
                  <span>{line.name} <span className="text-muted">{line.strength}</span></span>
                  <Input
                    className="w-24"
                    inputMode="numeric"
                    defaultValue={String(line.counted)}
                    onBlur={(event) => {
                      const counted = Number(event.target.value);
                      if (!Number.isInteger(counted)) return;
                      void api("/api/stocktakes", {
                        method: "POST",
                        body: JSON.stringify({ action: "count", drugId: line.drugId, counted }),
                      });
                    }}
                  />
                </label>
              ))}
              <Button
                onClick={() =>
                  void api("/api/stocktakes", { method: "POST", body: JSON.stringify({ action: "post" }) })
                    .then(() => {
                      toast.success("Count posted. The shelf matches the book.");
                      setSheet(null);
                    })
                    .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not post the count."))
                }
              >
                Post count
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
