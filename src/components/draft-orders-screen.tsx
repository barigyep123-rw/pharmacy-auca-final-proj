"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { describeStock, unitLabel } from "@/lib/units";
import type { DraftOrder } from "@/lib/reorder";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Board = {
  drafts: DraftOrder[];
  lastScan: { at: string; drafts: number; lines: number } | null;
};

export function DraftOrdersScreen() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [mergeSupplier, setMergeSupplier] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [packs, setPacks] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancel = false;
    api<Board>("/api/reorder/drafts")
      .then((result) => {
        if (!cancel) setBoard(result);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load drafts.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function scan() {
    setPending(true);
    try {
      const result = await api<Board & { lines: number }>("/api/reorder/scan", { method: "POST", body: "{}" });
      setBoard(result);
      toast.success(result.lines === 0 ? "Nothing new is under its reorder point." : "Draft lines added for low stock.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not scan.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(draft: DraftOrder) {
    setEditing(draft.id);
    setSupplierName(draft.supplierName);
    setPacks(Object.fromEntries(draft.lines.map((line) => [line.drugId, String(line.packs)])));
  }

  async function saveEdit(draft: DraftOrder) {
    const lines = draft.lines.flatMap((line) => {
      const count = Number(packs[line.drugId]);
      if (!Number.isInteger(count) || count < 1) return [];
      return [{ drugId: line.drugId, packs: count }];
    });
    if (lines.length === 0) {
      toast.error("Keep at least one whole pack, or cancel the draft from supplier orders.");
      return;
    }
    setPending(true);
    try {
      const result = await api<Board>(`/api/reorder/drafts/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ supplierName, lines }),
      });
      setBoard(result);
      setEditing(null);
      toast.success("Draft updated. It is still not ordered.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the draft.");
    } finally {
      setPending(false);
    }
  }

  async function send(id: number) {
    setPending(true);
    try {
      const result = await api<Board>(`/api/reorder/drafts/${id}/send`, { method: "POST", body: "{}" });
      setBoard(result);
      toast.success("Draft sent. Receive it from Inventory when the goods arrive. The invoice is recorded in Finance.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not send the draft.");
    } finally {
      setPending(false);
    }
  }

  async function merge() {
    if (picked.length < 2) {
      toast.error("Choose at least two drafts.");
      return;
    }
    setPending(true);
    try {
      const result = await api<Board>(`/api/reorder/merge`, {
        method: "POST",
        body: JSON.stringify({ ids: picked, supplierName: mergeSupplier }),
      });
      setBoard(result);
      setPicked([]);
      toast.success("Drafts merged into one. It is still not ordered.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not merge the drafts.");
    } finally {
      setPending(false);
    }
  }

  if (!board && !error) return <LoadingBlock label="Opening draft orders…" />;
  if (!board) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Procurement"
        title="Draft orders"
        lede="A scan puts every drug at or under its reorder point onto a draft, in whole packs, with the last supplier filled in. Sending it does not add stock and does not write an invoice."
        action={<Button onClick={() => void scan()} disabled={pending}>{pending ? "Working…" : "Scan now"}</Button>}
      />
      <p className="mb-4 text-sm text-muted">
        The same scan also runs once each Kigali day while the server is up. Suggested quantities are base units, rounded up so a box is never split.
      </p>
      {board.drafts.length >= 2 ? (
        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Merge selected onto</span>
            <Input value={mergeSupplier} onChange={(event) => setMergeSupplier(event.target.value)} placeholder="Supplier" />
          </label>
          <Button variant="quiet" disabled={pending || picked.length < 2} onClick={() => void merge()}>
            Merge {picked.length || ""} drafts
          </Button>
        </Card>
      ) : null}
      {board.drafts.length === 0 ? (
        <Card className="p-4 text-sm text-muted">No drafts waiting. Scan when the shelves look thin.</Card>
      ) : (
        <div className="space-y-4">
          {board.drafts.map((draft) => (
            <Card key={draft.id} className="p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={picked.includes(draft.id)}
                    onChange={(event) =>
                      setPicked((current) =>
                        event.target.checked ? [...current, draft.id] : current.filter((id) => id !== draft.id),
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">{draft.supplierName}</span>
                    {draft.terms ? <span className="mt-1 block text-sm text-muted">{draft.terms}</span> : null}
                  </span>
                </label>
                <div className="flex gap-2">
                  <Button variant="quiet" size="sm" onClick={() => (editing === draft.id ? setEditing(null) : startEdit(draft))}>
                    {editing === draft.id ? "Close" : "Adjust"}
                  </Button>
                  <Button size="sm" disabled={pending} onClick={() => void send(draft.id)}>Send</Button>
                </div>
              </div>
              {editing === draft.id ? (
                <div className="mb-3 space-y-2">
                  <label className="block max-w-sm space-y-1.5">
                    <span className="text-sm font-medium">Supplier</span>
                    <Input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
                  </label>
                  <Button size="sm" disabled={pending} onClick={() => void saveEdit(draft)}>Save draft</Button>
                </div>
              ) : null}
              <ul className="divide-y divide-line text-sm">
                {draft.lines.map((line) => (
                  <li key={line.drugId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {line.drugName} <span className="text-muted">{line.strength}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        On hand {describeStock(line.onHand, line.unitsPerPack, line.baseUnit, line.packUnit)} · reorder {line.reorderLevel} {line.baseUnit}s
                      </span>
                    </span>
                    {editing === draft.id ? (
                      <label className="flex items-center gap-2">
                        <Input
                          className="w-20"
                          inputMode="numeric"
                          aria-label={`Packs of ${line.drugName}`}
                          value={packs[line.drugId] ?? ""}
                          onChange={(event) => setPacks((current) => ({ ...current, [line.drugId]: event.target.value }))}
                        />
                        <span className="text-muted">{unitLabel(line.unitsPerPack, line.baseUnit)} per {line.packUnit}</span>
                      </label>
                    ) : (
                      <span className="tabular-nums">
                        {describeStock(line.quantity, line.unitsPerPack, line.baseUnit, line.packUnit)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
