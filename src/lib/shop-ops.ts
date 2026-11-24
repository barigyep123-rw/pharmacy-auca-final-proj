import { createHash } from "node:crypto";
import { assertAccess } from "./access";
import { writeAudit } from "./audit";
import { sql, withTransaction } from "./db";
import { ApiError } from "./errors";
import { addLot, consumeFefo, lotLabel } from "./lots";
import type { QueryFn } from "./query";
import { kigaliToday } from "./time";
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

export type CategoryNode = {
  id: number;
  name: string;
  description: string;
  subcategories: Array<{ id: number; name: string; description: string }>;
};

export async function listCategoryTree(): Promise<CategoryNode[]> {
  const categories = await sql<{ id: number; name: string; description: string }>(
    `select id, name, description from categories order by name`,
  );
  const subs = await sql<{ id: number; category_id: number; name: string; description: string }>(
    `select id, category_id, name, description from subcategories order by name`,
  );
  return categories.map((category) => ({
    id: num(category.id),
    name: text(category.name),
    description: text(category.description),
    subcategories: subs
      .filter((sub) => num(sub.category_id) === num(category.id))
      .map((sub) => ({ id: num(sub.id), name: text(sub.name), description: text(sub.description) })),
  }));
}

export async function createCategory(user: Staff, input: { name: string; description: string }) {
  assertAccess(user.role, "settings");
  try {
    const [row] = await sql<{ id: number }>(
      `insert into categories (name, description) values ($1, $2) returning id`,
      [input.name, input.description],
    );
    await writeAudit(sql, user, {
      action: "create",
      entity: "category",
      entityId: num(row.id),
      summary: `Added the category ${input.name}.`,
    });
    return num(row.id);
  } catch (error) {
    const { isUniqueViolation } = await import("./errors");
    if (isUniqueViolation(error)) throw new ApiError(409, "That category is already on the list.");
    throw error;
  }
}

export async function updateCategory(user: Staff, id: number, input: { name: string; description: string }) {
  assertAccess(user.role, "settings");
  const [row] = await sql<{ id: number }>(
    `update categories set name = $1, description = $2 where id = $3 returning id`,
    [input.name, input.description, id],
  );
  if (!row) throw new ApiError(404, "That category is no longer on the list.");
  await sql(`update drugs set category = $1 where category_id = $2`, [input.name, id]);
  await writeAudit(sql, user, {
    action: "update",
    entity: "category",
    entityId: id,
    summary: `Renamed a category to ${input.name}.`,
    detail: input.description,
  });
}

export async function deleteCategory(user: Staff, id: number) {
  assertAccess(user.role, "settings");
  const [used] = await sql<{ n: number }>(`select count(*)::int as n from drugs where category_id = $1`, [id]);
  if (num(used?.n) > 0) throw new ApiError(409, "Drugs still use this category. Move them first.");
  const [row] = await sql<{ id: number }>(`delete from categories where id = $1 returning id`, [id]);
  if (!row) throw new ApiError(404, "That category is no longer on the list.");
  await writeAudit(sql, user, {
    action: "delete",
    entity: "category",
    entityId: id,
    summary: "Removed a category.",
  });
}

export async function createSubcategory(
  user: Staff,
  categoryId: number,
  input: { name: string; description: string },
) {
  assertAccess(user.role, "settings");
  const [parent] = await sql<{ id: number }>(`select id from categories where id = $1`, [categoryId]);
  if (!parent) throw new ApiError(404, "That category is no longer on the list.");
  try {
    const [row] = await sql<{ id: number }>(
      `insert into subcategories (category_id, name, description) values ($1, $2, $3) returning id`,
      [categoryId, input.name, input.description],
    );
    await writeAudit(sql, user, {
      action: "create",
      entity: "category",
      entityId: num(row.id),
      summary: `Added the subcategory ${input.name}.`,
    });
    return num(row.id);
  } catch (error) {
    const { isUniqueViolation } = await import("./errors");
    if (isUniqueViolation(error)) throw new ApiError(409, "That subcategory is already under this category.");
    throw error;
  }
}

export async function deleteSubcategory(user: Staff, id: number) {
  assertAccess(user.role, "settings");
  const [used] = await sql<{ n: number }>(`select count(*)::int as n from drugs where subcategory_id = $1`, [id]);
  if (num(used?.n) > 0) throw new ApiError(409, "Drugs still use this subcategory. Move them first.");
  const [row] = await sql<{ id: number }>(`delete from subcategories where id = $1 returning id`, [id]);
  if (!row) throw new ApiError(404, "That subcategory is no longer on the list.");
}

export async function listGenericNames() {
  const rows = await sql<{ name: string }>(
    `select name from (
       select name from generics
       union
       select btrim(generic_name) as name from drugs where btrim(generic_name) <> ''
     ) names
     order by lower(name)`,
  );
  return rows.map((row) => text(row.name)).filter((name) => name.length >= 2);
}

export async function ensureGenericVariant(
  query: QueryFn,
  input: { genericName: string; strength: string; form: string },
) {
  const name = input.genericName.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { genericId: null, variantId: null };
  const [existing] = await query<{ id: number }>(
    `select id from generics where lower(name) = lower($1)`,
    [name],
  );
  const genericId = existing
    ? num(existing.id)
    : num(
        (
          await query<{ id: number }>(`insert into generics (name) values ($1) returning id`, [name])
        )[0].id,
      );
  const [variant] = await query<{ id: number }>(
    `insert into variants (generic_id, strength, form) values ($1, $2, $3)
     on conflict (generic_id, strength, form) do update set form = excluded.form
     returning id`,
    [genericId, input.strength.trim(), input.form.trim() || "tablet"],
  );
  return { genericId, variantId: num(variant.id) };
}

export async function resolveCategory(
  query: QueryFn,
  input: { categoryId?: number | null; category?: string; subcategoryId?: number | null },
) {
  let categoryId = input.categoryId ?? null;
  let name = (input.category ?? "").trim();
  if (categoryId) {
    const [row] = await query<{ id: number; name: string }>(`select id, name from categories where id = $1`, [categoryId]);
    if (!row) throw new ApiError(400, "Choose a category from Settings.");
    name = text(row.name);
  } else if (name) {
    const [row] = await query<{ id: number; name: string }>(
      `select id, name from categories where lower(name) = lower($1)`,
      [name],
    );
    if (row) {
      categoryId = num(row.id);
      name = text(row.name);
    } else {
      const [created] = await query<{ id: number }>(
        `insert into categories (name) values ($1) returning id`,
        [name],
      );
      categoryId = num(created.id);
    }
  } else {
    throw new ApiError(400, "Choose a category.");
  }
  const subcategoryId = input.subcategoryId ?? null;
  if (subcategoryId) {
    const [sub] = await query<{ id: number }>(
      `select id from subcategories where id = $1 and category_id = $2`,
      [subcategoryId, categoryId],
    );
    if (!sub) throw new ApiError(400, "That subcategory is not under the chosen category.");
  }
  return { categoryId, category: name, subcategoryId };
}

export async function listSiblingBrands(drugId: number) {
  const rows = await sql<{
    id: number;
    name: string;
    brand_name: string;
    manufacturer: string;
    strength: string;
    quantity: number;
    unit_price: number;
    variant_id: number | null;
  }>(
    `select s.id, s.name, s.brand_name, s.manufacturer, s.strength, s.quantity, s.unit_price, s.variant_id
     from drugs d
     join drugs s on s.variant_id = d.variant_id
     where d.id = $1 and d.variant_id is not null
     order by s.name`,
    [drugId],
  );
  return rows.map((row) => ({
    id: num(row.id),
    name: text(row.name),
    brandName: text(row.brand_name) || text(row.name),
    manufacturer: text(row.manufacturer),
    strength: text(row.strength),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    sameVariant: true,
  }));
}

export async function assertBrandSwap(query: QueryFn, fromId: number, toId: number, reason: string, allowStrengthChange: boolean) {
  if (fromId === toId) return;
  const rows = await query<{ id: number; variant_id: number | null; generic_id: number | null; name: string }>(
    `select id, variant_id, generic_id, name from drugs where id = any($1::int[])`,
    [[fromId, toId]],
  );
  const from = rows.find((row) => num(row.id) === fromId);
  const to = rows.find((row) => num(row.id) === toId);
  if (!from || !to) throw new ApiError(404, "That brand is no longer in the catalog.");
  if (from.variant_id != null && num(from.variant_id) === num(to.variant_id)) return;
  if (
    allowStrengthChange &&
    from.generic_id != null &&
    num(from.generic_id) === num(to.generic_id) &&
    reason.trim().length >= 2
  ) {
    return;
  }
  throw new ApiError(
    409,
    `${text(to.name)} is a different strength. A brand swap has to stay on the same strength and form, unless a pharmacist records why.`,
  );
}

export async function safetyWarnings(query: QueryFn, drugId: number, patientId: number | null) {
  const warnings: string[] = [];
  const [drug] = await query<{ generic_name: string; rx_only: boolean; name: string }>(
    `select generic_name, rx_only, name from drugs where id = $1`,
    [drugId],
  );
  if (!drug) return warnings;
  if (!patientId) return warnings;
  const [patient] = await query<{ allergies: string; brand_preference: string; preferred_brand: string }>(
    `select allergies, brand_preference, preferred_brand from patients where id = $1`,
    [patientId],
  );
  if (!patient) return warnings;
  const generic = text(drug.generic_name);
  const allergies = text(patient.allergies);
  if (generic && allergies.toLowerCase().includes(generic.toLowerCase())) {
    throw new ApiError(409, `${text(drug.name)} matches an allergy on this patient (${allergies}).`);
  }
  if (text(patient.brand_preference) === "generic_only" && text(drug.name).toLowerCase() !== generic.toLowerCase()) {
    warnings.push("This patient asked for a generic brand.");
  }
  if (text(patient.brand_preference) === "brand" && text(patient.preferred_brand)) {
    const wanted = text(patient.preferred_brand).toLowerCase();
    if (!text(drug.name).toLowerCase().includes(wanted) && !text(drug.generic_name).toLowerCase().includes(wanted)) {
      warnings.push(`This patient prefers ${text(patient.preferred_brand)}.`);
    }
  }
  const pairs = await query<{ left_name: string; right_name: string; note: string }>(
    `select left_name, right_name, note from therapy_pairs`,
  );
  const recent = await query<{ generic_name: string }>(
    `select d.generic_name from sales s join drugs d on d.id = s.drug_id
     where s.patient_id = $1 and s.created_at > now() - interval '30 days'`,
    [patientId],
  );
  const names = new Set(recent.map((row) => text(row.generic_name).toLowerCase()));
  for (const pair of pairs) {
    const left = text(pair.left_name).toLowerCase();
    const right = text(pair.right_name).toLowerCase();
    const current = generic.toLowerCase();
    if ((current === left && names.has(right)) || (current === right && names.has(left))) {
      warnings.push(text(pair.note));
    }
  }
  return warnings;
}

export function fiscalMark(input: { receiptNumber: string; total: number; tin: string; at: string; ebmSerial: string }) {
  const code = createHash("sha256")
    .update(`${input.tin}|${input.receiptNumber}|${input.total}|${input.at}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  const note = input.ebmSerial
    ? `Local fiscal mark ${code}. Prepared for EBM device ${input.ebmSerial}. This slip is not itself an RRA signature.`
    : `Local fiscal mark ${code}. Not an RRA-signed EBM receipt until a certified invoicing device is connected.`;
  return { code, note };
}

export async function openTill(user: Staff) {
  assertAccess(user.role, "sales");
  const [open] = await sql<{ id: number }>(
    `select id from till_shifts where closed_at is null order by id desc limit 1`,
  );
  if (open) throw new ApiError(409, "A shift is already open.");
  const [row] = await sql<{ id: number }>(
    `insert into till_shifts (opened_by) values ($1) returning id`,
    [user.id],
  );
  return num(row.id);
}

export async function closeTill(user: Staff, countedCash: number, note: string) {
  assertAccess(user.role, "sales");
  const [open] = await sql<{ id: number; opened_at: string }>(
    `select id, opened_at from till_shifts where closed_at is null order by id desc limit 1`,
  );
  if (!open) throw new ApiError(409, "No shift is open.");
  const [cash] = await sql<{ total: number }>(
    `select coalesce(sum(s.total), 0)::int as total
     from sales s
     join payment_methods m on m.id = s.payment_method_id
     where m.kind = 'cash' and s.created_at >= $1`,
    [open.opened_at],
  );
  const expected = num(cash?.total);
  await sql(
    `update till_shifts set closed_by = $1, closed_at = now(), expected_cash = $2, counted_cash = $3, note = $4 where id = $5`,
    [user.id, expected, countedCash, note, num(open.id)],
  );
  await writeAudit(sql, user, {
    action: "close",
    entity: "till",
    entityId: num(open.id),
    summary: `Closed the till. Expected ${expected}, counted ${countedCash}.`,
  });
  return { expected, counted: countedCash, variance: countedCash - expected };
}

export async function currentTill() {
  const [open] = await sql<{ id: number; opened_at: string; name: string }>(
    `select t.id, t.opened_at, u.name from till_shifts t join users u on u.id = t.opened_by
     where t.closed_at is null order by t.id desc limit 1`,
  );
  if (!open) return null;
  return { id: num(open.id), openedAt: text(open.opened_at), openedBy: text(open.name) };
}

export async function listInsurers() {
  const rows = await sql<{ id: number; name: string; kind: string }>(`select id, name, kind from insurers order by name`);
  return rows.map((row) => ({ id: num(row.id), name: text(row.name), kind: text(row.kind) }));
}

export async function createClaim(
  user: Staff,
  input: {
    insurerId: number;
    patientId?: number | null;
    saleId?: number | null;
    memberNumber: string;
    patientPaid: number;
    insurerAmount: number;
    notes: string;
  },
) {
  assertAccess(user.role, "finance");
  const [row] = await sql<{ id: number }>(
    `insert into claims (insurer_id, patient_id, sale_id, member_number, patient_paid, insurer_amount, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.insurerId,
      input.patientId,
      input.saleId,
      input.memberNumber,
      input.patientPaid,
      input.insurerAmount,
      input.notes,
      user.id,
    ],
  );
  await writeAudit(sql, user, {
    action: "create",
    entity: "claim",
    entityId: num(row.id),
    summary: `Opened an insurer claim for ${input.insurerAmount} RWF.`,
  });
  return num(row.id);
}

export async function listClaims() {
  const rows = await sql(
    `select c.id, i.name as insurer, c.member_number, c.patient_paid, c.insurer_amount, c.status, c.created_at,
            coalesce(p.name, '') as patient_name
     from claims c
     join insurers i on i.id = c.insurer_id
     left join patients p on p.id = c.patient_id
     order by c.created_at desc limit 80`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    insurer: text(row.insurer),
    patientName: text(row.patient_name),
    memberNumber: text(row.member_number),
    patientPaid: num(row.patient_paid),
    insurerAmount: num(row.insurer_amount),
    status: text(row.status),
    createdAt: text(row.created_at),
  }));
}

export async function setClaimStatus(user: Staff, id: number, status: string) {
  assertAccess(user.role, "finance");
  const allowed = new Set(["draft", "sent", "part", "paid", "late"]);
  if (!allowed.has(status)) throw new ApiError(400, "That claim status is not used.");
  const [row] = await sql<{ id: number }>(`update claims set status = $1 where id = $2 returning id`, [status, id]);
  if (!row) throw new ApiError(404, "That claim is not on the list.");
}

export async function startStocktake(user: Staff, note: string) {
  assertAccess(user.role, "inventory");
  const [open] = await sql<{ id: number }>(`select id from stocktakes where status = 'open' limit 1`);
  if (open) return num(open.id);
  const [row] = await sql<{ id: number }>(
    `insert into stocktakes (note, created_by) values ($1, $2) returning id`,
    [note, user.id],
  );
  const drugs = await sql<{ id: number; quantity: number }>(`select id, quantity from drugs order by name`);
  for (const drug of drugs) {
    await sql(
      `insert into stocktake_lines (stocktake_id, drug_id, expected_qty, counted_qty) values ($1, $2, $3, $3)`,
      [num(row.id), num(drug.id), num(drug.quantity)],
    );
  }
  return num(row.id);
}

export async function stocktakeSheet() {
  const [open] = await sql<{ id: number; note: string }>(
    `select id, note from stocktakes where status = 'open' order by id desc limit 1`,
  );
  if (!open) return null;
  const lines = await sql(
    `select l.drug_id, d.name, d.strength, l.expected_qty, l.counted_qty
     from stocktake_lines l join drugs d on d.id = l.drug_id
     where l.stocktake_id = $1 order by d.name`,
    [num(open.id)],
  );
  return {
    id: num(open.id),
    note: text(open.note),
    lines: lines.map((line) => ({
      drugId: num(line.drug_id),
      name: text(line.name),
      strength: text(line.strength),
      expected: num(line.expected_qty),
      counted: num(line.counted_qty),
    })),
  };
}

export async function saveStocktakeLine(user: Staff, drugId: number, counted: number) {
  assertAccess(user.role, "inventory");
  const [open] = await sql<{ id: number }>(`select id from stocktakes where status = 'open' order by id desc limit 1`);
  if (!open) throw new ApiError(409, "Start a stocktake first.");
  await sql(
    `update stocktake_lines set counted_qty = $1 where stocktake_id = $2 and drug_id = $3`,
    [counted, num(open.id), drugId],
  );
}

export async function postStocktake(user: Staff) {
  assertAccess(user.role, "inventory");
  const today = kigaliToday();
  await withTransaction(async (query) => {
    const [open] = await query<{ id: number }>(
      `select id from stocktakes where status = 'open' order by id desc limit 1 for update`,
    );
    if (!open) throw new ApiError(409, "No open stocktake.");
    const lines = await query<{ drug_id: number; expected_qty: number; counted_qty: number; expiry_date: string; batch_number: string }>(
      `select l.drug_id, l.expected_qty, l.counted_qty, d.expiry_date, d.batch_number
       from stocktake_lines l join drugs d on d.id = l.drug_id
       where l.stocktake_id = $1`,
      [num(open.id)],
    );
    for (const line of lines) {
      const delta = num(line.counted_qty) - num(line.expected_qty);
      if (delta > 0) {
        const expiry = text(line.expiry_date).slice(0, 10);
        await addLot(query, num(line.drug_id), {
          lotNumber: text(line.batch_number) || "COUNT",
          expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : today,
          quantity: delta,
        });
      } else if (delta < 0) {
        await consumeFefo(query, num(line.drug_id), -delta);
      }
    }
    await query(
      `update stocktakes set status = 'posted', posted_by = $1, posted_at = now() where id = $2`,
      [user.id, num(open.id)],
    );
    await writeAudit(query, user, {
      action: "post",
      entity: "stocktake",
      entityId: num(open.id),
      summary: "Posted a physical stocktake. Counts now match the shelf.",
    });
  });
}

export async function saveReadyNote(user: Staff, input: { patientId: number | null; phone: string; body: string }) {
  assertAccess(user.role, "sales");
  const [row] = await sql<{ id: number }>(
    `insert into ready_notes (patient_id, phone, body, created_by) values ($1, $2, $3, $4) returning id`,
    [input.patientId, input.phone, input.body, user.id],
  );
  return num(row.id);
}

export { lotLabel };
