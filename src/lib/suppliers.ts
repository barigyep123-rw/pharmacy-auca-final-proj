import { writeAudit } from "./audit";
import { assertAccess } from "./access";
import { sql } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { QueryFn } from "./query";
import type { Staff } from "./types";

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  return String(value);
}

export type SupplierProfile = {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  terms: string;
  notes: string;
  active: boolean;
  invoiceCount: number;
  openInvoiceTotal: number;
};

export async function ensureSupplier(query: QueryFn, name: string) {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) throw new ApiError(400, "Enter the supplier.");
  const [existing] = await query<{ id: number; name: string }>(
    `select id, name from suppliers where lower(name) = lower($1) limit 1`,
    [cleaned],
  );
  if (existing) return { id: num(existing.id), name: text(existing.name) };
  try {
    const [row] = await query<{ id: number; name: string }>(
      `insert into suppliers (name) values ($1) returning id, name`,
      [cleaned],
    );
    return { id: num(row.id), name: text(row.name) };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [again] = await query<{ id: number; name: string }>(
      `select id, name from suppliers where lower(name) = lower($1) limit 1`,
      [cleaned],
    );
    if (!again) throw error;
    return { id: num(again.id), name: text(again.name) };
  }
}

export async function listSupplierProfiles(): Promise<SupplierProfile[]> {
  const rows = await sql(
    `select s.id, s.name, s.contact_name, s.phone, s.email, s.address, s.terms, s.notes, s.active,
            (select count(*) from supplier_invoices i where i.supplier_id = s.id)::int as invoice_count,
            (
              select coalesce(sum(amount), 0)::int from supplier_invoices i
              where i.supplier_id = s.id and i.status = 'open'
            ) as open_invoice_total
     from suppliers s
     order by s.active desc, lower(s.name)`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: text(row.name),
    contactName: text(row.contact_name),
    phone: text(row.phone),
    email: text(row.email),
    address: text(row.address),
    terms: text(row.terms),
    notes: text(row.notes),
    active: row.active !== false,
    invoiceCount: num(row.invoice_count),
    openInvoiceTotal: num(row.open_invoice_total),
  }));
}

export async function updateSupplier(
  actor: Staff,
  id: number,
  input: {
    name: string;
    contactName: string;
    phone: string;
    email: string;
    address: string;
    terms: string;
    notes: string;
    active: boolean;
  },
) {
  assertAccess(actor.role, "orders");
  try {
    const [row] = await sql<{ id: number; name: string }>(
      `update suppliers set
         name = $1, contact_name = $2, phone = $3, email = $4, address = $5,
         terms = $6, notes = $7, active = $8
       where id = $9
       returning id, name`,
      [
        input.name,
        input.contactName,
        input.phone,
        input.email,
        input.address,
        input.terms,
        input.notes,
        input.active,
        id,
      ],
    );
    if (!row) throw new ApiError(404, "That supplier is not on the list.");
    await writeAudit(sql, actor, {
      action: "update",
      entity: "supplier",
      entityId: id,
      summary: `Updated the supplier profile for ${text(row.name)}.`,
    });
    const profiles = await listSupplierProfiles();
    const saved = profiles.find((item) => item.id === id);
    if (!saved) throw new ApiError(500, "The supplier was saved but could not be read back.");
    return saved;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "A supplier with that name already exists.");
    throw error;
  }
}
