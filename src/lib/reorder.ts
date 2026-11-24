import { assertAccess } from "./access";
import { writeAudit } from "./audit";
import { sql, withTransaction } from "./db";
import { ApiError } from "./errors";
import { ensureSupplier } from "./suppliers";
import { packsForShortfall } from "./units";
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

export type DraftLine = {
  drugId: number;
  drugName: string;
  strength: string;
  baseUnit: string;
  packUnit: string;
  unitsPerPack: number;
  onHand: number;
  reorderLevel: number;
  quantity: number;
  packs: number;
};

export type DraftOrder = {
  id: number;
  supplierId: number | null;
  supplierName: string;
  terms: string;
  notes: string;
  orderedAt: string;
  lines: DraftLine[];
};

async function loadDrafts(ids?: number[]): Promise<DraftOrder[]> {
  const rows = await sql(
    `select p.id, p.supplier_id, p.supplier_name, p.notes, p.ordered_at, coalesce(s.terms, '') as terms
     from purchase_orders p
     left join suppliers s on s.id = p.supplier_id
     where p.status = 'draft'
       and ($1::int[] is null or p.id = any($1::int[]))
     order by p.ordered_at desc, p.id desc`,
    [ids ?? null],
  );
  if (rows.length === 0) return [];
  const orderIds = rows.map((row) => num(row.id));
  const items = await sql(
    `select i.order_id, i.drug_id, i.quantity, d.name, d.strength, d.base_unit, d.pack_unit,
            d.units_per_pack, d.quantity as on_hand, d.reorder_level
     from purchase_order_items i
     join drugs d on d.id = i.drug_id
     where i.order_id = any($1::int[])
     order by d.name`,
    [orderIds],
  );
  return rows.map((row) => ({
    id: num(row.id),
    supplierId: row.supplier_id == null ? null : num(row.supplier_id),
    supplierName: text(row.supplier_name),
    terms: text(row.terms),
    notes: text(row.notes),
    orderedAt: text(row.ordered_at),
    lines: items
      .filter((item) => num(item.order_id) === num(row.id))
      .map((item) => {
        const per = Math.max(1, num(item.units_per_pack));
        const quantity = num(item.quantity);
        return {
          drugId: num(item.drug_id),
          drugName: text(item.name),
          strength: text(item.strength),
          baseUnit: text(item.base_unit) || "tablet",
          packUnit: text(item.pack_unit) || "box",
          unitsPerPack: per,
          onHand: num(item.on_hand),
          reorderLevel: num(item.reorder_level),
          quantity,
          packs: Math.max(1, Math.round(quantity / per)),
        };
      }),
  }));
}

export async function listDrafts() {
  const drafts = await loadDrafts();
  const [scan] = await sql<{ created_at: unknown; drafts: number; lines: number }>(
    `select created_at, drafts, lines from reorder_scans order by id desc limit 1`,
  );
  return {
    drafts,
    lastScan: scan
      ? { at: text(scan.created_at), drafts: num(scan.drafts), lines: num(scan.lines) }
      : null,
  };
}

export async function scanReorderDrafts(actor: Staff) {
  assertAccess(actor.role, "drafts");
  return withTransaction(async (query) => {
    const rows = await query<{
      id: number;
      name: string;
      supplier: string;
      quantity: number;
      reorder_level: number;
      units_per_pack: number;
    }>(
      `select d.id, d.name, d.supplier, d.quantity, d.reorder_level, d.units_per_pack
       from drugs d
       where d.quantity <= d.reorder_level
         and not exists (
           select 1
           from purchase_order_items i
           join purchase_orders p on p.id = i.order_id
           where i.drug_id = d.id and p.status in ('draft', 'ordered')
         )
       order by d.supplier, d.name
       for update of d`,
    );
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const supplier = text(row.supplier).trim() || "Unassigned supplier";
      const list = groups.get(supplier) ?? [];
      list.push(row);
      groups.set(supplier, list);
    }
    const created: number[] = [];
    for (const [supplierName, lines] of groups) {
      const supplier = await ensureSupplier(query, supplierName);
      const [order] = await query<{ id: number }>(
        `insert into purchase_orders (supplier_id, supplier_name, status, notes, ordered_by)
         values ($1, $2, 'draft', 'Reorder draft. Nothing is ordered until this is sent.', $3)
         returning id`,
        [supplier.id, supplier.name, actor.id],
      );
      for (const line of lines) {
        const per = Math.max(1, num(line.units_per_pack));
        const quantity = packsForShortfall(num(line.quantity), num(line.reorder_level), per);
        await query(
          `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, entered_packs)
           values ($1, $2, $3, 0, $4)`,
          [num(order.id), num(line.id), quantity, quantity / per],
        );
      }
      await writeAudit(query, actor, {
        action: "create",
        entity: "order",
        entityId: num(order.id),
        summary: `Opened a reorder draft for ${supplier.name} with ${lines.length} line${lines.length === 1 ? "" : "s"}.`,
      });
      created.push(num(order.id));
    }
    const lineCount = rows.length;
    await query(
      `insert into reorder_scans (ran_by, drafts, lines) values ($1, $2, $3)`,
      [actor.id, created.length, lineCount],
    );
    return { drafts: created.length, lines: lineCount, ids: created };
  });
}

export async function scanIfDue() {
  const [admin] = await sql<{ id: number; name: string; email: string; role: Staff["role"] }>(
    `select id, name, email, role from users where role = 'admin' and active = true order by id limit 1`,
  );
  if (!admin) return { drafts: 0, lines: 0, skipped: true };
  const [recent] = await sql<{ due: boolean }>(
    `select coalesce(
       (select (created_at at time zone 'Africa/Kigali')::date < (now() at time zone 'Africa/Kigali')::date
        from reorder_scans order by id desc limit 1),
       true
     ) as due`,
  );
  if (!recent?.due) return { drafts: 0, lines: 0, skipped: true };
  const result = await scanReorderDrafts(admin);
  return { ...result, skipped: false };
}

export async function updateDraft(
  actor: Staff,
  id: number,
  input: { supplierName: string; lines: Array<{ drugId: number; packs: number }> },
) {
  assertAccess(actor.role, "drafts");
  const drugIds = input.lines.map((line) => line.drugId);
  if (new Set(drugIds).size !== drugIds.length) throw new ApiError(400, "Each drug can appear once.");
  await withTransaction(async (query) => {
    const [order] = await query<{ id: number; status: string }>(
      `select id, status from purchase_orders where id = $1 for update`,
      [id],
    );
    if (!order) throw new ApiError(404, "That draft is not on the list.");
    if (order.status !== "draft") throw new ApiError(409, "Only a draft can be edited.");
    const supplier = await ensureSupplier(query, input.supplierName);
    await query(
      `update purchase_orders set supplier_id = $1, supplier_name = $2 where id = $3`,
      [supplier.id, supplier.name, id],
    );
    await query(`delete from purchase_order_items where order_id = $1`, [id]);
    for (const line of input.lines) {
      const [drug] = await query<{ units_per_pack: number; name: string }>(
        `select units_per_pack, name from drugs where id = $1`,
        [line.drugId],
      );
      if (!drug) throw new ApiError(400, "One of the drugs is no longer in the catalog.");
      const per = Math.max(1, num(drug.units_per_pack));
      await query(
        `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, entered_packs)
         values ($1, $2, $3, 0, $4)`,
        [id, line.drugId, line.packs * per, line.packs],
      );
    }
    await writeAudit(query, actor, {
      action: "update",
      entity: "order",
      entityId: id,
      summary: `Adjusted reorder draft ${id} for ${supplier.name}.`,
    });
  });
}

export async function sendDraft(actor: Staff, id: number) {
  assertAccess(actor.role, "drafts");
  await withTransaction(async (query) => {
    const [order] = await query<{ id: number; status: string; supplier_name: string }>(
      `select id, status, supplier_name from purchase_orders where id = $1 for update`,
      [id],
    );
    if (!order) throw new ApiError(404, "That draft is not on the list.");
    if (order.status !== "draft") throw new ApiError(409, "This draft was already sent.");
    const [count] = await query<{ n: number }>(
      `select count(*)::int as n from purchase_order_items where order_id = $1`,
      [id],
    );
    if (num(count?.n) === 0) throw new ApiError(409, "Add a line before sending.");
    await query(
      `update purchase_orders set status = 'ordered', ordered_at = now() where id = $1`,
      [id],
    );
    await writeAudit(query, actor, {
      action: "send",
      entity: "order",
      entityId: id,
      summary: `Sent draft ${id} to ${text(order.supplier_name)}. Stock stays put until it is received.`,
    });
  });
}

export async function mergeDrafts(actor: Staff, ids: number[], supplierName: string) {
  assertAccess(actor.role, "drafts");
  const unique = [...new Set(ids)];
  if (unique.length < 2) throw new ApiError(400, "Choose at least two drafts.");
  return withTransaction(async (query) => {
    const rows = await query<{ id: number; status: string }>(
      `select id, status from purchase_orders where id = any($1::int[]) order by id for update`,
      [unique],
    );
    if (rows.length !== unique.length) throw new ApiError(404, "One of those drafts is missing.");
    if (rows.some((row) => row.status !== "draft")) throw new ApiError(409, "Only drafts can be merged.");
    const items = await query<{ drug_id: number; quantity: number; units_per_pack: number }>(
      `select i.drug_id, i.quantity, d.units_per_pack
       from purchase_order_items i
       join drugs d on d.id = i.drug_id
       where i.order_id = any($1::int[])`,
      [unique],
    );
    const totals = new Map<number, { quantity: number; per: number }>();
    for (const item of items) {
      const current = totals.get(num(item.drug_id)) ?? { quantity: 0, per: Math.max(1, num(item.units_per_pack)) };
      current.quantity += num(item.quantity);
      totals.set(num(item.drug_id), current);
    }
    if (totals.size === 0) throw new ApiError(409, "Those drafts have no lines.");
    const supplier = await ensureSupplier(query, supplierName);
    const [order] = await query<{ id: number }>(
      `insert into purchase_orders (supplier_id, supplier_name, status, notes, ordered_by)
       values ($1, $2, 'draft', 'Merged from other drafts. Nothing is ordered until this is sent.', $3)
       returning id`,
      [supplier.id, supplier.name, actor.id],
    );
    for (const [drugId, total] of totals) {
      const packs = Math.ceil(total.quantity / total.per);
      await query(
        `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, entered_packs)
         values ($1, $2, $3, 0, $4)`,
        [num(order.id), drugId, packs * total.per, packs],
      );
    }
    await query(
      `update purchase_orders
       set status = 'cancelled', notes = notes || ' Merged into draft ' || $2 || '.'
       where id = any($1::int[])`,
      [unique, String(num(order.id))],
    );
    await writeAudit(query, actor, {
      action: "merge",
      entity: "order",
      entityId: num(order.id),
      summary: `Merged ${unique.length} drafts into draft ${num(order.id)} for ${supplier.name}.`,
    });
    return { id: num(order.id) };
  });
}
