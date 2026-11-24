import { writeAudit } from "./audit";
import { assertAccess } from "./access";
import { sql } from "./db";
import { ApiError } from "./errors";
import type { QueryFn } from "./query";
import type { Staff } from "./types";

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function ensurePatient(
  query: QueryFn,
  actor: { id: number; name: string },
  input: { name: string; phone: string },
) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const phone = input.phone.trim();
  const [existing] = await query<{ id: number }>(
    `select id from patients where lower(name) = lower($1) and lower(phone) = lower($2) limit 1`,
    [name, phone],
  );
  if (existing) return num(existing.id);
  const [row] = await query<{ id: number }>(
    `insert into patients (name, phone) values ($1, $2) returning id`,
    [name, phone],
  );
  const id = num(row.id);
  await writeAudit(query, actor, {
    action: "create",
    entity: "patient",
    entityId: id,
    summary: `Opened a patient record for ${name}.`,
  });
  return id;
}

export type PatientSummary = {
  id: number;
  name: string;
  phone: string;
  notes: string;
  prescriptionCount: number;
  lastVisit: string | null;
};

export async function listPatients(search = ""): Promise<PatientSummary[]> {
  const term = search.trim();
  const rows = await sql(
    `select p.id, p.name, p.phone, p.notes,
            (select count(*) from prescriptions x where x.patient_id = p.id)::int as prescription_count,
            (
              select max(at) from (
                select f.created_at as at
                from prescription_fills f
                join prescriptions r on r.id = f.prescription_id
                where r.patient_id = p.id
                union all
                select s.created_at from sales s where s.patient_id = p.id
              ) visits
            ) as last_visit
     from patients p
     where $1 = ''
        or lower(p.name) like '%' || lower($1) || '%'
        or lower(p.phone) like '%' || lower($1) || '%'
     order by lower(p.name)
     limit 100`,
    [term],
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: text(row.name),
    phone: text(row.phone),
    notes: text(row.notes),
    prescriptionCount: num(row.prescription_count),
    lastVisit: row.last_visit == null ? null : text(row.last_visit),
  }));
}

export type PatientVisit = {
  at: string;
  kind: "fill" | "sale";
  summary: string;
  prescriptionId: number | null;
};

export type PatientHistory = {
  id: number;
  name: string;
  phone: string;
  notes: string;
  prescriptions: Array<{
    id: number;
    doctorName: string;
    status: string;
    refillsAllowed: number;
    fillsUsed: number;
    createdAt: string;
    lines: string;
  }>;
  visits: PatientVisit[];
};

export async function patientHistory(id: number): Promise<PatientHistory> {
  const [patient] = await sql<{ id: number; name: string; phone: string; notes: string }>(
    `select id, name, phone, notes from patients where id = $1`,
    [id],
  );
  if (!patient) throw new ApiError(404, "That patient is not on the record.");
  const prescriptions = await sql(
    `select p.id, p.doctor_name, p.status, p.refills_allowed, p.created_at,
            (select count(*) from prescription_fills f where f.prescription_id = p.id)::int as fills_used,
            (
              select string_agg(d.name || ' ' || d.strength, ', ' order by i.id)
              from prescription_items i
              join drugs d on d.id = i.drug_id
              where i.prescription_id = p.id
            ) as lines
     from prescriptions p
     where p.patient_id = $1
     order by p.created_at desc`,
    [id],
  );
  const fills = await sql(
    `select f.created_at, f.fill_number, f.prescription_id, u.name as dispenser, p.refills_allowed
     from prescription_fills f
     join prescriptions p on p.id = f.prescription_id
     join users u on u.id = f.dispensed_by
     where p.patient_id = $1
     order by f.created_at desc`,
    [id],
  );
  const sales = await sql(
    `select s.created_at, s.quantity, s.total, s.prescription_id, d.name as drug_name, d.strength
     from sales s
     join drugs d on d.id = s.drug_id
     where s.patient_id = $1 and s.prescription_id is null
     order by s.created_at desc`,
    [id],
  );
  const visits: PatientVisit[] = [
    ...fills.map((row) => ({
      at: text(row.created_at),
      kind: "fill" as const,
      summary:
        num(row.fill_number) === 1
          ? `First fill of script ${num(row.prescription_id)}, dispensed by ${text(row.dispenser)}.`
          : `Refill ${num(row.fill_number) - 1} of script ${num(row.prescription_id)}, dispensed by ${text(row.dispenser)}.`,
      prescriptionId: num(row.prescription_id),
    })),
    ...sales.map((row) => ({
      at: text(row.created_at),
      kind: "sale" as const,
      summary: `Counter sale: ${num(row.quantity)} ${text(row.drug_name)} ${text(row.strength)}.`,
      prescriptionId: null,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    id: num(patient.id),
    name: text(patient.name),
    phone: text(patient.phone),
    notes: text(patient.notes),
    prescriptions: prescriptions.map((row) => ({
      id: num(row.id),
      doctorName: text(row.doctor_name),
      status: text(row.status),
      refillsAllowed: num(row.refills_allowed),
      fillsUsed: num(row.fills_used),
      createdAt: text(row.created_at),
      lines: text(row.lines),
    })),
    visits,
  };
}

export async function updatePatientNotes(actor: Staff, id: number, notes: string) {
  assertAccess(actor.role, "patients");
  const [row] = await sql<{ id: number; name: string }>(
    `update patients set notes = $1 where id = $2 returning id, name`,
    [notes, id],
  );
  if (!row) throw new ApiError(404, "That patient is not on the record.");
  await writeAudit(sql, actor, {
    action: "update",
    entity: "patient",
    entityId: id,
    summary: `Updated notes for ${text(row.name)}.`,
  });
}
