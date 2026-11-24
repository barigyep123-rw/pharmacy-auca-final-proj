"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CoverageRule, InsurerCompany, RuleScope } from "@/lib/insurance";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { LoadingBlock, Notice, PageHeader } from "./ui/chrome";

const kinds = [
  { id: "rssb", label: "RSSB" },
  { id: "mmi", label: "MMI" },
  { id: "mutuelle", label: "Mutuelle" },
  { id: "private", label: "Private" },
] as const;

const blank = {
  name: "",
  kind: "private" as InsurerCompany["kind"],
  phone: "",
  email: "",
  address: "",
  coverPercent: "0",
  period: "year" as InsurerCompany["period"],
  spendingLimit: "",
  limitAction: "warn" as InsurerCompany["limitAction"],
  stacks: false,
  formularyMode: "list" as InsurerCompany["formularyMode"],
  coverOtc: false,
  notes: "",
  active: true,
};

function fromCompany(company: InsurerCompany) {
  return {
    name: company.name,
    kind: company.kind,
    phone: company.phone,
    email: company.email,
    address: company.address,
    coverPercent: String(company.coverPercent),
    period: company.period,
    spendingLimit: company.spendingLimit == null ? "" : String(company.spendingLimit),
    limitAction: company.limitAction,
    stacks: company.stacks,
    formularyMode: company.formularyMode,
    coverOtc: company.coverOtc,
    notes: company.notes,
    active: company.active,
  };
}

export function InsuranceSettings() {
  const [companies, setCompanies] = useState<InsurerCompany[] | null>(null);
  const [rules, setRules] = useState<CoverageRule[]>([]);
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scope, setScope] = useState<RuleScope>("category");
  const [ruleName, setRuleName] = useState("");
  const [ruleCovered, setRuleCovered] = useState(true);
  const [rulePercent, setRulePercent] = useState("");

  async function load() {
    const result = await api<{ companies: InsurerCompany[] }>("/api/insurance/companies");
    setCompanies(result.companies);
    return result.companies;
  }

  useEffect(() => {
    let cancel = false;
    api<{ companies: InsurerCompany[] }>("/api/insurance/companies")
      .then((result) => {
        if (!cancel) setCompanies(result.companies);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load insurers.");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (typeof selected !== "number") return;
    let cancel = false;
    api<{ rules: CoverageRule[] }>(`/api/insurance/companies/${selected}/rules`)
      .then((result) => {
        if (!cancel) setRules(result.rules);
      })
      .catch(() => {
        if (!cancel) setRules([]);
      });
    return () => {
      cancel = true;
    };
  }, [selected]);

  function payload() {
    const coverPercent = Number(form.coverPercent);
    const spending = form.spendingLimit.trim() === "" ? null : Number(form.spendingLimit);
    return {
      ...form,
      coverPercent: Number.isInteger(coverPercent) ? coverPercent : 0,
      spendingLimit: spending != null && Number.isInteger(spending) ? spending : null,
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      const body = JSON.stringify(payload());
      if (selected === "new") {
        const result = await api<{ company: InsurerCompany }>("/api/insurance/companies", { method: "POST", body });
        await load();
        setSelected(result.company.id);
        toast.success("Insurer added.");
      } else if (typeof selected === "number") {
        await api(`/api/insurance/companies/${selected}`, { method: "PATCH", body });
        await load();
        toast.success("Insurer saved.");
      }
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not save the insurer.");
    } finally {
      setPending(false);
    }
  }

  async function addFormularyRule(event: React.FormEvent) {
    event.preventDefault();
    if (typeof selected !== "number") return;
    const percent = rulePercent.trim() === "" ? null : Number(rulePercent);
    try {
      const result = await api<{ rules: CoverageRule[] }>(`/api/insurance/companies/${selected}/rules`, {
        method: "POST",
        body: JSON.stringify({
          scope,
          name: ruleName,
          covered: ruleCovered,
          coverPercent: percent != null && Number.isInteger(percent) ? percent : null,
        }),
      });
      setRules(result.rules);
      setRuleName("");
      setRulePercent("");
      toast.success(ruleCovered ? "Coverage rule added." : "Exclusion added.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not add the rule.");
    }
  }

  if (!companies && !error) return <LoadingBlock label="Opening insurance…" />;
  if (!companies) return <Notice>{error}</Notice>;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Insurance"
        lede="RSSB pays 85% of prescribed medicines. Mutuelle at this private counter starts at 0%. Private plans use the contract you type here. The counter applies the card only after the member number is on the patient."
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="p-3">
          <Button
            className="mb-3 w-full"
            onClick={() => {
              setSelected("new");
              setForm(blank);
              setFormError(null);
            }}
          >
            New insurer
          </Button>
          <ul className="space-y-1">
            {companies.map((company) => (
              <li key={company.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected === company.id ? "bg-pine text-paper-2" : "hover:bg-paper"}`}
                  onClick={() => {
                    setSelected(company.id);
                    setForm(fromCompany(company));
                    setFormError(null);
                  }}
                >
                  <span className="block font-medium">{company.name}</span>
                  <span className={`block text-xs ${selected === company.id ? "text-paper-2/80" : "text-muted"}`}>
                    {company.coverPercent}% · {company.formularyMode === "list" ? "List only" : "Open formulary"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {selected == null ? (
          <Card className="p-4 text-sm text-muted">Choose an insurer to set the co-pay, the spending limit, and which categories it pays.</Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
                {formError ? <div className="sm:col-span-2"><Notice>{formError}</Notice></div> : null}
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Name</span>
                  <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Type</span>
                  <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as InsurerCompany["kind"] })}>
                    {kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Phone</span>
                  <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Email</span>
                  <Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Address</span>
                  <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Reimbursement %</span>
                  <Input inputMode="numeric" value={form.coverPercent} onChange={(event) => setForm({ ...form, coverPercent: event.target.value })} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Limit period</span>
                  <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as InsurerCompany["period"] })}>
                    <option value="month">Each month</option>
                    <option value="year">Each year</option>
                    <option value="prescription">Each prescription</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Spending limit (RWF)</span>
                  <Input inputMode="numeric" value={form.spendingLimit} placeholder="Empty means no cap" onChange={(event) => setForm({ ...form, spendingLimit: event.target.value })} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">When the limit is passed</span>
                  <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={form.limitAction} onChange={(event) => setForm({ ...form, limitAction: event.target.value as InsurerCompany["limitAction"] })}>
                    <option value="warn">Warn, insurer pays up to the cap</option>
                    <option value="block">Block the sale until someone accepts it</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Formulary</span>
                  <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={form.formularyMode} onChange={(event) => setForm({ ...form, formularyMode: event.target.value as InsurerCompany["formularyMode"] })}>
                    <option value="list">Only listed items are paid</option>
                    <option value="open">Everything eligible, unless excluded</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.coverOtc} onChange={(event) => setForm({ ...form, coverOtc: event.target.checked })} />
                  Cover over-the-counter lines that have no rule
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.stacks} onChange={(event) => setForm({ ...form, stacks: event.target.checked })} />
                  This insurer can pay a share of what another insurer left
                </label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                  Active at the counter
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Notes</span>
                  <Textarea value={form.notes} rows={4} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save insurer"}</Button>
                </div>
              </form>
            </Card>
            {typeof selected === "number" ? (
              <Card className="p-4">
                <h2 className="mb-1 font-serif text-xl">Formulary</h2>
                <p className="mb-3 text-sm text-muted">
                  A rule matches the brand first, then the generic, then the category. An exclusion stops the sale unless the counter accepts that the patient pays it. A blank percent uses the company rate. 80% on antibiotics and 50% on other listed lines is two rules.
                </p>
                {rules.length === 0 ? <p className="mb-3 text-sm text-muted">No rules yet.</p> : (
                  <ul className="mb-3 divide-y divide-line text-sm">
                    {rules.map((rule) => (
                      <li key={rule.id} className="flex items-center justify-between gap-3 py-2">
                        <span>
                          {rule.scope} · {rule.name}
                          {rule.covered ? ` · ${rule.coverPercent == null ? "company rate" : `${rule.coverPercent}%`}` : " · excluded"}
                        </span>
                        <button
                          type="button"
                          className="text-clay hover:underline"
                          onClick={() => {
                            void api<{ rules: CoverageRule[] }>(`/api/insurance/companies/${selected}/rules/${rule.id}`, { method: "DELETE" })
                              .then((result) => setRules(result.rules))
                              .catch((caught: unknown) => toast.error(caught instanceof Error ? caught.message : "Could not remove the rule."));
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void addFormularyRule(event)}>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Matches</span>
                    <select className="h-10 w-full rounded-lg border border-line bg-paper-2 px-2 text-sm" value={scope} onChange={(event) => setScope(event.target.value as RuleScope)}>
                      <option value="category">Category</option>
                      <option value="generic">Generic</option>
                      <option value="brand">Brand</option>
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Name</span>
                    <Input value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Antibiotic, paracetamol, Panadol" required />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium">Percent, if covered</span>
                    <Input inputMode="numeric" value={rulePercent} placeholder="Company rate" onChange={(event) => setRulePercent(event.target.value)} />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ruleCovered} onChange={(event) => setRuleCovered(event.target.checked)} />
                    Covered. Clear this to exclude it.
                  </label>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit" variant="quiet">{ruleCovered ? "Add coverage" : "Add exclusion"}</Button>
                  </div>
                </form>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
