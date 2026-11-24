"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import type { InsurerCompany, PatientPolicy } from "@/lib/insurance";
import type { PatientHistory } from "@/lib/patients";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { SearchableSelect } from "./searchable-select";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

export function PatientHistoryScreen({ id }: { id: number }) {
  const [record, setRecord] = useState<PatientHistory | null>(null);
  const [notes, setNotes] = useState("");
  const [sex, setSex] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [allergies, setAllergies] = useState("");
  const [insurerName, setInsurerName] = useState("");
  const [memberNumber, setMemberNumber] = useState("");
  const [preferredBrand, setPreferredBrand] = useState("");
  const [brandPreference, setBrandPreference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [policies, setPolicies] = useState<PatientPolicy[]>([]);
  const [companies, setCompanies] = useState<InsurerCompany[]>([]);
  const [insurerId, setInsurerId] = useState<number | null>(null);
  const [cardNumber, setCardNumber] = useState("");

  useEffect(() => {
    let cancel = false;
    api<PatientHistory>(`/api/patients/${id}`)
      .then((result) => {
        if (cancel) return;
        setRecord(result);
        setNotes(result.notes);
        setSex(result.sex);
        setDateOfBirth(result.dateOfBirth);
        setAllergies(result.allergies);
        setInsurerName(result.insurerName);
        setMemberNumber(result.memberNumber);
        setPreferredBrand(result.preferredBrand);
        setBrandPreference(result.brandPreference);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load this patient.");
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ policies: PatientPolicy[] }>(`/api/patients/${id}/policies`),
      api<{ companies: InsurerCompany[] }>("/api/insurance/companies"),
    ])
      .then(([cards, insurers]) => {
        if (cancel) return;
        setPolicies(cards.policies);
        const active = insurers.companies.filter((company) => company.active);
        setCompanies(active);
        setInsurerId((current) => current ?? active[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [id]);

  async function saveNotes(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api<PatientHistory>(`/api/patients/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes, sex, dateOfBirth, allergies, insurerName, memberNumber, preferredBrand, brandPreference }),
      });
      setRecord(result);
      toast.success("Notes saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not save the notes.");
    } finally {
      setPending(false);
    }
  }

  if (!record && !error) return <LoadingBlock label="Opening the patient record…" />;
  if (!record) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Patients"
        title={record.name}
        lede={record.phone || "No phone on the record."}
      />
      <p className="mb-4 text-sm">
        <Link href="/patients" className="text-pine underline">All patients</Link>
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-serif text-xl">Insurance cards</h2>
            <p className="mt-1 text-sm text-muted">The counter verifies this member number. A free-text insurer name above is only a note.</p>
            {policies.length === 0 ? <p className="mt-3 text-sm text-muted">No card yet.</p> : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {policies.map((policy) => (
                  <li key={policy.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{policy.insurerName} · {policy.memberNumber}{policy.isPrimary ? " · primary" : ""}</span>
                    <button
                      type="button"
                      className="text-clay hover:underline"
                      onClick={() => {
                        void api<{ policies: PatientPolicy[] }>(`/api/patients/${id}/policies/${policy.id}`, { method: "DELETE" })
                          .then((result) => setPolicies(result.policies))
                          .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not remove the card."));
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!insurerId) return;
                void api<{ policies: PatientPolicy[] }>(`/api/patients/${id}/policies`, {
                  method: "POST",
                  body: JSON.stringify({ insurerId, memberNumber: cardNumber, isPrimary: policies.length === 0 }),
                })
                  .then((result) => {
                    setPolicies(result.policies);
                    setCardNumber("");
                    toast.success("Card saved. The counter can verify it.");
                  })
                  .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not save the card."));
              }}
            >
              <label className="space-y-1.5 text-sm">
                Insurer
                <SearchableSelect
                  value={insurerId == null ? "" : String(insurerId)}
                  options={companies.map((company) => ({ value: String(company.id), label: company.name }))}
                  onChange={(value) => setInsurerId(Number(value))}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                Member number
                <Input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} required />
              </label>
              <Button type="submit" variant="quiet">Add card</Button>
            </form>
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-serif text-xl">Prescriptions</h2>
            {record.prescriptions.length === 0 ? (
              <p className="p-4 text-sm text-muted">No prescriptions yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {record.prescriptions.map((script) => (
                  <li key={script.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{script.lines || "No drugs"}</p>
                      <Badge tone={script.status === "dispensed" ? "pine" : script.status === "cancelled" ? "neutral" : "amber"}>
                        {script.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted">
                      {script.doctorName || "No prescriber"} · filed {formatWhen(script.createdAt)} · {script.fillsUsed} of {1 + script.refillsAllowed} fills
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-serif text-xl">Visits</h2>
            {record.visits.length === 0 ? (
              <p className="p-4 text-sm text-muted">No fills or counter sales are tied to this patient yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {record.visits.map((visit, index) => (
                  <li key={`${visit.at}-${index}`} className="px-4 py-3 text-sm">
                    <p>{visit.summary}</p>
                    <p className="mt-1 text-muted">{formatWhen(visit.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card className="p-4">
          <h2 className="mb-3 font-serif text-xl">Notes</h2>
          <form className="space-y-3" onSubmit={(event) => void saveNotes(event)}>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
            <label className="block space-y-1.5 text-sm">
              Sex
              <SearchableSelect
                value={sex}
                placeholder="Not recorded"
                options={[
                  { value: "", label: "Not recorded" },
                  { value: "female", label: "Female" },
                  { value: "male", label: "Male" },
                ]}
                onChange={setSex}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              Date of birth
              <Input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              Allergies
              <Input value={allergies} onChange={(event) => setAllergies(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              Insurer
              <Input value={insurerName} onChange={(event) => setInsurerName(event.target.value)} placeholder="RSSB, MMI, Mutuelle" />
            </label>
            <label className="block space-y-1.5 text-sm">
              Member number
              <Input value={memberNumber} onChange={(event) => setMemberNumber(event.target.value)} />
            </label>
            <label className="block space-y-1.5 text-sm">
              Brand preference
              <SearchableSelect
                value={brandPreference}
                placeholder="No preference"
                options={[
                  { value: "", label: "No preference" },
                  { value: "any", label: "Any brand" },
                  { value: "generic_only", label: "Generic only" },
                  { value: "brand", label: "A named brand" },
                ]}
                onChange={setBrandPreference}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              Preferred brand
              <Input value={preferredBrand} onChange={(event) => setPreferredBrand(event.target.value)} />
            </label>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save notes"}</Button>
            <Button
              type="button"
              variant="quiet"
              disabled={pending || !record}
              onClick={() => {
                if (!record) return;
                const message = `Your medicine is ready at the pharmacy. Ask for ${record.name}.`;
                void api("/api/ready-notes", {
                  method: "POST",
                  body: JSON.stringify({ patientId: record.id, phone: record.phone, body: message }),
                })
                  .then(() => toast.success("Ready message saved. This build does not send SMS or WhatsApp."))
                  .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not save the message."));
              }}
            >
              Save a ready message
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
