import { assertAccess, can } from "./access";
import { writeAudit } from "./audit";
import { sql } from "./db";
import { ApiError } from "./errors";
import { getBusinessProfile, saleTotal } from "./settings";
import { kigaliToday } from "./time";
import type { Staff } from "./types";

export type InsurerKind = "rssb" | "mmi" | "mutuelle" | "private";
export type CoverPeriod = "month" | "year" | "prescription";
export type FormularyMode = "list" | "open";
export type LimitAction = "warn" | "block";
export type RuleScope = "category" | "generic" | "brand";

export type InsurerCompany = {
  id: number;
  name: string;
  kind: InsurerKind;
  phone: string;
  email: string;
  address: string;
  coverPercent: number;
  period: CoverPeriod;
  spendingLimit: number | null;
  limitAction: LimitAction;
  stacks: boolean;
  formularyMode: FormularyMode;
  coverOtc: boolean;
  notes: string;
  active: boolean;
};

export type CoverageRule = {
  id: number;
  insurerId: number;
  scope: RuleScope;
  name: string;
  covered: boolean;
  coverPercent: number | null;
};

export type PatientPolicy = {
  id: number;
  patientId: number;
  insurerId: number;
  insurerName: string;
  memberNumber: string;
  active: boolean;
  isPrimary: boolean;
};

export type CoverageQuote = {
  patientId: number;
  patientName: string;
  memberNumber: string;
  patientPayable: number;
  insurerAmount: number;
  warnings: string[];
  shares: Array<{ insurerId: number; insurerName: string; memberNumber: string; amount: number; remainingAfter: number | null }>;
  lines: Array<{
    drugId: number;
    total: number;
    patientPayable: number;
    splits: Array<{ insurerId: number; insurerName: string; memberNumber: string; amount: number; note: string }>;
  }>;
};

type CompanyRow = {
  id: number;
  name: string;
  kind: string;
  phone: string;
  email: string;
  address: string;
  cover_percent: number;
  period: string;
  spending_limit: number | null;
  limit_action: string;
  stacks: boolean;
  formulary_mode: string;
  cover_otc: boolean;
  notes: string;
  active: boolean;
};

type DrugFace = {
  id: number;
  name: string;
  brand_name: string;
  generic_name: string;
  category: string;
  rx_only: boolean;
  rssb_cover: number | null;
  mutuelle_cover: number | null;
};

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function same(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function mapCompany(row: CompanyRow): InsurerCompany {
  return {
    id: num(row.id),
    name: text(row.name),
    kind: text(row.kind) as InsurerKind,
    phone: text(row.phone),
    email: text(row.email),
    address: text(row.address),
    coverPercent: num(row.cover_percent),
    period: (text(row.period) || "month") as CoverPeriod,
    spendingLimit: row.spending_limit == null ? null : num(row.spending_limit),
    limitAction: (text(row.limit_action) || "warn") as LimitAction,
    stacks: row.stacks === true,
    formularyMode: (text(row.formulary_mode) || "list") as FormularyMode,
    coverOtc: row.cover_otc === true,
    notes: text(row.notes),
    active: row.active !== false,
  };
}

const companySelect = `select id, name, kind, phone, email, address, cover_percent, period, spending_limit,
  limit_action, stacks, formulary_mode, cover_otc, notes, active from insurers`;

export async function listCompanies(): Promise<InsurerCompany[]> {
  const rows = await sql<CompanyRow>(`${companySelect} order by name`);
  return rows.map(mapCompany);
}

export async function saveCompany(
  actor: Staff,
  input: Omit<InsurerCompany, "id" | "spendingLimit"> & { id?: number; spendingLimit?: number | null },
): Promise<InsurerCompany> {
  assertAccess(actor.role, "settings");
  const limit = input.spendingLimit && input.spendingLimit > 0 ? input.spendingLimit : null;
  if (input.id) {
    const [row] = await sql<CompanyRow>(
      `update insurers set
         name = $1, kind = $2, phone = $3, email = $4, address = $5, cover_percent = $6, period = $7,
         spending_limit = $8, limit_action = $9, stacks = $10, formulary_mode = $11, cover_otc = $12,
         notes = $13, active = $14
       where id = $15
       returning id, name, kind, phone, email, address, cover_percent, period, spending_limit,
         limit_action, stacks, formulary_mode, cover_otc, notes, active`,
      [
        input.name, input.kind, input.phone, input.email, input.address, input.coverPercent, input.period,
        limit, input.limitAction, input.stacks, input.formularyMode, input.coverOtc, input.notes, input.active,
        input.id,
      ],
    );
    if (!row) throw new ApiError(404, "That insurer is not on the list.");
    await writeAudit(sql, actor, {
      action: "update",
      entity: "insurer",
      entityId: input.id,
      summary: `Updated ${input.name}. Cover ${input.coverPercent}%.`,
    });
    return mapCompany(row);
  }
  const [row] = await sql<CompanyRow>(
    `insert into insurers (
       name, kind, phone, email, address, cover_percent, period, spending_limit, limit_action, stacks,
       formulary_mode, cover_otc, notes, active
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning id, name, kind, phone, email, address, cover_percent, period, spending_limit,
       limit_action, stacks, formulary_mode, cover_otc, notes, active`,
    [
      input.name, input.kind, input.phone, input.email, input.address, input.coverPercent, input.period,
      limit, input.limitAction, input.stacks, input.formularyMode, input.coverOtc, input.notes, input.active,
    ],
  );
  await writeAudit(sql, actor, {
    action: "create",
    entity: "insurer",
    entityId: num(row.id),
    summary: `Added insurer ${input.name}.`,
  });
  return mapCompany(row);
}

export async function listRules(insurerId: number): Promise<CoverageRule[]> {
  const rows = await sql<{
    id: number;
    insurer_id: number;
    scope: string;
    name: string;
    covered: boolean;
    cover_percent: number | null;
  }>(
    `select id, insurer_id, scope, name, covered, cover_percent from coverage_rules
     where insurer_id = $1 order by scope, name`,
    [insurerId],
  );
  return rows.map((row) => ({
    id: num(row.id),
    insurerId: num(row.insurer_id),
    scope: text(row.scope) as RuleScope,
    name: text(row.name),
    covered: row.covered !== false,
    coverPercent: row.cover_percent == null ? null : num(row.cover_percent),
  }));
}

export async function addRule(
  actor: Staff,
  insurerId: number,
  input: { scope: RuleScope; name: string; covered: boolean; coverPercent?: number | null },
) {
  assertAccess(actor.role, "settings");
  const [insurer] = await sql<{ id: number }>(`select id from insurers where id = $1`, [insurerId]);
  if (!insurer) throw new ApiError(404, "That insurer is not on the list.");
  const [row] = await sql<{ id: number }>(
    `insert into coverage_rules (insurer_id, scope, name, covered, cover_percent)
     values ($1, $2, $3, $4, $5) returning id`,
    [insurerId, input.scope, input.name.trim(), input.covered, input.covered ? input.coverPercent ?? null : null],
  );
  await writeAudit(sql, actor, {
    action: "create",
    entity: "coverage_rule",
    entityId: num(row.id),
    summary: `${input.covered ? "Cover" : "Exclude"} ${input.scope} ${input.name.trim()}.`,
  });
  return listRules(insurerId);
}

export async function removeRule(actor: Staff, insurerId: number, ruleId: number) {
  assertAccess(actor.role, "settings");
  const [row] = await sql<{ id: number }>(
    `delete from coverage_rules where id = $1 and insurer_id = $2 returning id`,
    [ruleId, insurerId],
  );
  if (!row) throw new ApiError(404, "That rule is not on the list.");
  return listRules(insurerId);
}

export async function listPolicies(patientId: number): Promise<PatientPolicy[]> {
  const rows = await sql(
    `select p.id, p.patient_id, p.insurer_id, i.name as insurer_name, p.member_number, p.active, p.is_primary
     from patient_policies p
     join insurers i on i.id = p.insurer_id
     where p.patient_id = $1
     order by p.is_primary desc, i.name`,
    [patientId],
  );
  return rows.map((row) => ({
    id: num(row.id),
    patientId: num(row.patient_id),
    insurerId: num(row.insurer_id),
    insurerName: text(row.insurer_name),
    memberNumber: text(row.member_number),
    active: row.active !== false,
    isPrimary: row.is_primary === true,
  }));
}

export async function addPolicy(
  actor: Staff,
  patientId: number,
  input: { insurerId: number; memberNumber: string; isPrimary?: boolean },
) {
  if (!can(actor.role, "patients") && !can(actor.role, "settings")) {
    throw new ApiError(403, "You do not have access to that.");
  }
  const [patient] = await sql<{ id: number }>(`select id from patients where id = $1`, [patientId]);
  if (!patient) throw new ApiError(404, "That patient is not on the record.");
  const [insurer] = await sql<{ id: number; active: boolean }>(`select id, active from insurers where id = $1`, [input.insurerId]);
  if (!insurer || insurer.active === false) throw new ApiError(400, "Choose an active insurer.");
  const member = input.memberNumber.trim();
  if (input.isPrimary !== false) {
    await sql(`update patient_policies set is_primary = false where patient_id = $1`, [patientId]);
  }
  try {
    await sql(
      `insert into patient_policies (patient_id, insurer_id, member_number, is_primary)
       values ($1, $2, $3, $4)`,
      [patientId, input.insurerId, member, input.isPrimary !== false],
    );
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "23505") {
      throw new ApiError(409, "That member number is already registered with this insurer.");
    }
    throw error;
  }
  await writeAudit(sql, actor, {
    action: "create",
    entity: "policy",
    entityId: patientId,
    summary: `Linked member ${member} to patient ${patientId}.`,
  });
  return listPolicies(patientId);
}

export async function removePolicy(actor: Staff, patientId: number, policyId: number) {
  if (!can(actor.role, "patients") && !can(actor.role, "settings")) {
    throw new ApiError(403, "You do not have access to that.");
  }
  const [row] = await sql<{ id: number }>(
    `delete from patient_policies where id = $1 and patient_id = $2 returning id`,
    [policyId, patientId],
  );
  if (!row) throw new ApiError(404, "That card is not on the record.");
  return listPolicies(patientId);
}

function periodKey(period: CoverPeriod, today: string, prescriptionKey: string) {
  if (period === "year") return today.slice(0, 4);
  if (period === "prescription") return prescriptionKey;
  return today.slice(0, 7);
}

type PricedLine = { drugId: number; total: number };

export async function previewLineTotals(
  lines: Array<{ drugId: number; quantity: number; soldAs?: "base" | "strip" | "pack" }>,
): Promise<PricedLine[]> {
  const business = await getBusinessProfile();
  const ids = lines.map((line) => line.drugId);
  const rows = await sql<{
    id: number;
    unit_price: number;
    pack_price: number;
    strip_price: number;
    units_per_pack: number;
    strip_size: number;
  }>(
    `select id, unit_price, pack_price, strip_price, units_per_pack, strip_size from drugs where id = any($1::int[])`,
    [ids],
  );
  return lines.map((line) => {
    const drug = rows.find((row) => num(row.id) === line.drugId);
    if (!drug) throw new ApiError(400, "One of the drugs is no longer in the catalog.");
    const soldAs = line.soldAs ?? "base";
    const perPack = Math.max(1, num(drug.units_per_pack));
    const perStrip = Math.max(1, num(drug.strip_size) || 10);
    let unit = num(drug.unit_price);
    let base = line.quantity;
    if (soldAs === "pack") {
      const pack = num(drug.pack_price) > 0 ? num(drug.pack_price) : unit * perPack;
      unit = Math.max(0, Math.round(pack / perPack));
      base = line.quantity * perPack;
    } else if (soldAs === "strip") {
      const strip = num(drug.strip_price) > 0 ? num(drug.strip_price) : unit * perStrip;
      unit = Math.max(0, Math.round(strip / perStrip));
      base = line.quantity * perStrip;
    }
    return { drugId: line.drugId, total: saleTotal(unit, base, business) };
  });
}

function matchRule(rules: CoverageRule[], drug: DrugFace) {
  const brand = text(drug.brand_name) || text(drug.name);
  return (
    rules.find((rule) => rule.scope === "brand" && (same(rule.name, brand) || same(rule.name, drug.name))) ??
    rules.find((rule) => rule.scope === "generic" && same(rule.name, drug.generic_name)) ??
    rules.find((rule) => rule.scope === "category" && same(rule.name, drug.category)) ??
    null
  );
}

export async function quoteCoverage(input: {
  memberNumber: string;
  lines: PricedLine[];
  acknowledgeRisks?: boolean;
  patientId?: number | null;
  prescriptionKey?: string;
}): Promise<CoverageQuote> {
  const member = input.memberNumber.trim();
  if (member.length < 2) throw new ApiError(400, "Enter the member number on the card.");
  const matches = await sql<{ id: number; patient_id: number; insurer_id: number; patient_name: string }>(
    `select p.id, p.patient_id, p.insurer_id, pt.name as patient_name
     from patient_policies p
     join patients pt on pt.id = p.patient_id
     join insurers i on i.id = p.insurer_id
     where p.active and i.active and lower(p.member_number) = lower($1)`,
    [member],
  );
  if (matches.length === 0) {
    throw new ApiError(404, "This card is not registered. Add it on the patient record before the insurer will pay.");
  }
  const patientIds = [...new Set(matches.map((row) => num(row.patient_id)))];
  if (input.patientId && !patientIds.includes(input.patientId)) {
    throw new ApiError(409, "That card belongs to a different patient.");
  }
  if (patientIds.length > 1) {
    throw new ApiError(409, "This member number is on more than one patient. Open the right record and check the card.");
  }
  const patientId = patientIds[0];
  const patientName = text(matches[0]?.patient_name);
  const matchedId = num(matches.find((row) => num(row.patient_id) === patientId)?.id);
  const policyRows = await sql<{ id: number; insurer_id: number; member_number: string; is_primary: boolean }>(
    `select id, insurer_id, member_number, is_primary from patient_policies
     where patient_id = $1 and active order by is_primary desc, id`,
    [patientId],
  );
  const ordered = [...policyRows].sort((left, right) => {
    if (num(left.id) === matchedId) return -1;
    if (num(right.id) === matchedId) return 1;
    return (right.is_primary === true ? 1 : 0) - (left.is_primary === true ? 1 : 0);
  });
  const companies = await listCompanies();
  const applied: Array<{ policy: (typeof ordered)[number]; company: InsurerCompany }> = [];
  for (const policy of ordered) {
    const company = companies.find((item) => item.id === num(policy.insurer_id) && item.active);
    if (!company) continue;
    if (applied.length === 0 || company.stacks) applied.push({ policy, company });
  }
  if (applied.length === 0) throw new ApiError(409, "That card's insurer is inactive.");

  const drugIds = input.lines.map((line) => line.drugId);
  const drugs = await sql<DrugFace>(
    `select id, name, brand_name, generic_name, category, rx_only, rssb_cover, mutuelle_cover from drugs where id = any($1::int[])`,
    [drugIds],
  );
  const today = kigaliToday();
  const prescriptionKey = input.prescriptionKey ?? "preview";
  const rulesByInsurer = new Map<number, CoverageRule[]>();
  const used = new Map<number, number>();
  for (const item of applied) {
    rulesByInsurer.set(item.company.id, await listRules(item.company.id));
    const key = periodKey(item.company.period, today, prescriptionKey);
    const [sum] = await sql<{ n: number }>(
      `select coalesce(sum(amount), 0)::int as n from insurance_usage
       where patient_id = $1 and insurer_id = $2 and period_key = $3`,
      [patientId, item.company.id, key],
    );
    used.set(item.company.id, num(sum?.n));
  }

  const warnings: string[] = [];
  const shareTotals = new Map<number, number>();
  const lines = input.lines.map((line) => {
    const drug = drugs.find((row) => num(row.id) === line.drugId);
    if (!drug) throw new ApiError(400, "One of the drugs is no longer in the catalog.");
    let patient = line.total;
    const splits: CoverageQuote["lines"][number]["splits"] = [];
    for (const item of applied) {
      if (patient < 1) break;
      const rules = rulesByInsurer.get(item.company.id) ?? [];
      const rule = matchRule(rules, drug);
      if (rule && !rule.covered) {
        if (!input.acknowledgeRisks) {
          throw new ApiError(409, `${text(drug.name)} is excluded by ${item.company.name}. The patient would have to pay the full price.`);
        }
        warnings.push(`${text(drug.name)} is excluded by ${item.company.name}. The patient pays that line.`);
        continue;
      }
      const named = item.company.name.toLowerCase();
      const drugPercent = named === "rssb"
        ? (drug.rssb_cover == null ? null : num(drug.rssb_cover))
        : named.includes("mutuelle")
          ? (drug.mutuelle_cover == null ? null : num(drug.mutuelle_cover))
          : null;
      let percent: number | null = drugPercent;
      if (percent == null) {
        if (rule?.covered) percent = rule.coverPercent ?? item.company.coverPercent;
        else if (!drug.rx_only && !item.company.coverOtc) percent = null;
        else if (item.company.formularyMode === "open") percent = item.company.coverPercent;
      }
      if (percent == null || percent <= 0) {
        if (item.company.formularyMode === "list" && !rule) {
          warnings.push(`${text(drug.name)} is not on the ${item.company.name} list, so the patient pays it.`);
        }
        continue;
      }
      let share = Math.round((patient * percent) / 100);
      const spent = used.get(item.company.id) ?? 0;
      if (item.company.spendingLimit != null) {
        const room = Math.max(0, item.company.spendingLimit - spent);
        if (share > room) {
          if (item.company.limitAction === "block" && !input.acknowledgeRisks) {
            throw new ApiError(
              409,
              `${item.company.name} allows ${item.company.spendingLimit} RWF this period. ${room} RWF remains, which is less than this line.`,
            );
          }
          warnings.push(`${item.company.name} limit reached. The insurer pays ${room} RWF more and the patient pays the rest.`);
          share = room;
        }
      }
      if (share < 1) continue;
      used.set(item.company.id, spent + share);
      shareTotals.set(item.company.id, (shareTotals.get(item.company.id) ?? 0) + share);
      patient -= share;
      splits.push({
        insurerId: item.company.id,
        insurerName: item.company.name,
        memberNumber: text(item.policy.member_number),
        amount: share,
        note: `${item.company.name} ${percent}%`,
      });
    }
    return { drugId: line.drugId, total: line.total, patientPayable: patient, splits };
  });

  const insurerAmount = lines.reduce((sum, line) => sum + line.splits.reduce((inner, split) => inner + split.amount, 0), 0);
  const patientPayable = lines.reduce((sum, line) => sum + line.patientPayable, 0);
  const shares = applied.map((item) => {
    const amount = shareTotals.get(item.company.id) ?? 0;
    const spent = used.get(item.company.id) ?? 0;
    return {
      insurerId: item.company.id,
      insurerName: item.company.name,
      memberNumber: text(item.policy.member_number),
      amount,
      remainingAfter: item.company.spendingLimit == null ? null : Math.max(0, item.company.spendingLimit - spent),
    };
  }).filter((share) => share.amount > 0);

  return {
    patientId,
    patientName,
    memberNumber: member,
    patientPayable,
    insurerAmount,
    warnings: [...new Set(warnings)],
    shares,
    lines,
  };
}

export async function persistCoverage(
  actor: Staff,
  quote: CoverageQuote,
  saleIds: number[],
  prescriptionKey: string,
) {
  if (quote.lines.length !== saleIds.length) throw new ApiError(500, "Coverage could not be matched to the sale.");
  const today = kigaliToday();
  const companies = await listCompanies();
  for (let index = 0; index < quote.lines.length; index += 1) {
    const line = quote.lines[index];
    const saleId = saleIds[index];
    for (const split of line.splits) {
      await sql(
        `insert into sale_coverages (sale_id, insurer_id, member_number, patient_payable, insurer_amount, note)
         values ($1, $2, $3, $4, $5, $6)`,
        [saleId, split.insurerId, split.memberNumber, line.patientPayable, split.amount, split.note],
      );
      const company = companies.find((item) => item.id === split.insurerId);
      const key = periodKey(company?.period ?? "month", today, prescriptionKey);
      await sql(
        `insert into insurance_usage (patient_id, insurer_id, period_key, amount, sale_id)
         values ($1, $2, $3, $4, $5)`,
        [quote.patientId, split.insurerId, key, split.amount, saleId],
      );
    }
  }
  for (const share of quote.shares) {
    await sql(
      `insert into claims (insurer_id, patient_id, sale_id, member_number, patient_paid, insurer_amount, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        share.insurerId,
        quote.patientId,
        saleIds[0],
        share.memberNumber,
        quote.patientPayable,
        share.amount,
        "Opened from the counter when the card was verified. This is a local claim draft, not a submission to the insurer.",
        actor.id,
      ],
    );
  }
}

export function coverageNote(quote: CoverageQuote) {
  if (quote.shares.length === 0) {
    return `Card ${quote.memberNumber} verified for ${quote.patientName}. Nothing on this sale is covered, so the patient pays.`;
  }
  const parts = quote.shares.map((share) => {
    const left = share.remainingAfter == null ? "" : ` ${share.remainingAfter} RWF remains of the limit.`;
    return `${share.insurerName} pays ${share.amount} RWF.${left}`;
  });
  const extra = quote.warnings.length ? ` ${quote.warnings[0]}` : "";
  return `Card ${quote.memberNumber} verified for ${quote.patientName}. Patient pays ${quote.patientPayable} RWF. ${parts.join(" ")}${extra}`;
}

export function assertQuoteAccess(actor: Staff) {
  if (!can(actor.role, "sales") && !can(actor.role, "patients")) {
    throw new ApiError(403, "You do not have access to that.");
  }
}
