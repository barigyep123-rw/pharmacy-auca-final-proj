"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatRwf, formatWhen } from "@/lib/format";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { DocumentDialog } from "./print-document";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

type Insurer = { id: number; name: string; kind: string };
type Claim = {
  id: number;
  insurer: string;
  patientName: string;
  memberNumber: string;
  patientPaid: number;
  insurerAmount: number;
  status: string;
  createdAt: string;
};

export function ClaimsScreen() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [insurerId, setInsurerId] = useState<number | null>(null);
  const [memberNumber, setMemberNumber] = useState("");
  const [patientPaid, setPatientPaid] = useState("0");
  const [insurerAmount, setInsurerAmount] = useState("");
  const [printing, setPrinting] = useState<Claim | null>(null);

  useEffect(() => {
    let cancel = false;
    api<{ claims: Claim[]; insurers: Insurer[] }>("/api/finance/claims")
      .then((result) => {
        if (cancel) return;
        setClaims(result.claims);
        setInsurers(result.insurers);
        setInsurerId(result.insurers[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load claims.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function mark(id: number, status: string) {
    try {
      const result = await api<{ claims: Claim[] }>(`/api/finance/claims/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setClaims(result.claims);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not update the claim.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!insurerId) return;
    try {
      const result = await api<{ claims: Claim[] }>("/api/finance/claims", {
        method: "POST",
        body: JSON.stringify({
          insurerId,
          memberNumber,
          patientPaid: Number(patientPaid) || 0,
          insurerAmount: Number(insurerAmount) || 0,
          notes: "",
        }),
      });
      setClaims(result.claims);
      setMemberNumber("");
      setInsurerAmount("");
      toast.success("Claim recorded. It stays draft until you send it to the insurer.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not record the claim.");
    }
  }

  if (!claims && !error) return <LoadingBlock label="Opening claims…" />;
  if (!claims) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Finance"
        title="Claims"
        lede="RSSB, MMI, Mutuelle, and private insurers. The patient pays their part. The rest is money the insurer still owes."
      />
      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void submit(event)}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Insurer</span>
            <select
              className="h-10 rounded-lg border border-line bg-paper-2 px-2 text-sm"
              value={insurerId ?? ""}
              onChange={(event) => setInsurerId(Number(event.target.value))}
            >
              {insurers.map((insurer) => (
                <option key={insurer.id} value={insurer.id}>{insurer.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Member number</span>
            <Input value={memberNumber} onChange={(event) => setMemberNumber(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Patient paid</span>
            <Input inputMode="numeric" value={patientPaid} onChange={(event) => setPatientPaid(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Insurer owes</span>
            <Input inputMode="numeric" value={insurerAmount} onChange={(event) => setInsurerAmount(event.target.value)} required />
          </label>
          <Button type="submit">Record claim</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        {claims.length === 0 ? (
          <p className="p-4 text-sm text-muted">No claims yet. A claim is not a receipt. It is what the insurer still has to pay.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Insurer</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Owed</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-t border-line">
                  <td className="px-4 py-3 text-muted">{formatWhen(claim.createdAt)}</td>
                  <td className="px-4 py-3">{claim.insurer}</td>
                  <td className="px-4 py-3">{claim.memberNumber || claim.patientName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="mr-2">{claim.status}</span>
                    {claim.status === "draft" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        onClick={() => void mark(claim.id, "sent")}
                      >
                        Mark sent
                      </Button>
                    ) : null}
                    {claim.status === "sent" || claim.status === "part" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="quiet"
                        onClick={() => void mark(claim.id, "paid")}
                      >
                        Mark paid
                      </Button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="mr-3 tabular-nums">{formatRwf(claim.insurerAmount)}</span>
                    <Button type="button" size="sm" variant="quiet" onClick={() => setPrinting(claim)}>Print form</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <DocumentDialog
        open={Boolean(printing)}
        title="Insurance claim"
        description="A paper form for an insurer that still takes claims by hand. This is not submitted to RSSB or a private insurer."
        onClose={() => setPrinting(null)}
      >
        {printing ? (
          <div>
            <p style={{ margin: "12px 0 0", fontWeight: 700 }}>Manual insurance claim {printing.id}</p>
            <p style={{ margin: "8px 0 0" }}>Insurer: {printing.insurer}</p>
            <p style={{ margin: 0 }}>Member: {printing.memberNumber || "—"}</p>
            <p style={{ margin: 0 }}>Patient: {printing.patientName || "—"}</p>
            <p style={{ margin: 0 }}>Filed: {formatWhen(printing.createdAt)} · status {printing.status}</p>
            <p style={{ margin: "8px 0 0" }}>Patient paid {formatRwf(printing.patientPaid)}</p>
            <p style={{ margin: 0 }}>Insurer is asked to pay {formatRwf(printing.insurerAmount)}</p>
            <p style={{ margin: "16px 0 0" }}>Pharmacist signature ________ &nbsp;&nbsp; Date ________</p>
            <p style={{ margin: "12px 0 0" }}>Insurer stamp ________</p>
          </div>
        ) : null}
      </DocumentDialog>
    </div>
  );
}
