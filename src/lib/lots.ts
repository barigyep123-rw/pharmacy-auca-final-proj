import { writeAudit } from "./audit";
import { sql } from "./db";
import { ApiError } from "./errors";
import type { QueryFn } from "./query";
import { kigaliToday } from "./time";
import type { Staff } from "./types";

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export type LotAllocation = {
  batchId: number;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
};

export function lotLabel(allocations: LotAllocation[]) {
  return allocations
    .map((lot) => `${lot.lotNumber || "Lot"} · exp ${lot.expiryDate} · ${lot.quantity}`)
    .join("; ");
}

export async function syncDrugFromLots(query: QueryFn, drugId: number) {
  await query(
    `update drugs d set
       quantity = coalesce((select sum(quantity)::int from drug_batches b where b.drug_id = d.id), 0),
       expiry_date = coalesce(
         (select to_char(expiry_date, 'YYYY-MM-DD') from drug_batches b
          where b.drug_id = d.id and b.quantity > 0
          order by expiry_date, id limit 1),
         expiry_date
       ),
       batch_number = coalesce(
         (select lot_number from drug_batches b
          where b.drug_id = d.id and b.quantity > 0
          order by expiry_date, id limit 1),
         batch_number
       ),
       updated_at = now()
     where d.id = $1`,
    [drugId],
  );
}

export async function addLot(
  query: QueryFn,
  drugId: number,
  input: { lotNumber: string; expiryDate: string; quantity: number },
) {
  if (input.quantity < 1) throw new ApiError(400, "A lot needs a quantity of at least 1.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate)) throw new ApiError(400, "Use a real expiry date for the lot.");
  await backfillLots(query, drugId);
  const [batch] = await query<{ id: number }>(
    `insert into drug_batches (drug_id, lot_number, expiry_date, quantity)
     values ($1, $2, $3, $4)
     returning id`,
    [drugId, input.lotNumber.trim(), input.expiryDate, input.quantity],
  );
  await syncDrugFromLots(query, drugId);
  return num(batch.id);
}

async function backfillLots(query: QueryFn, drugId: number) {
  const [count] = await query<{ n: number }>(
    `select count(*)::int as n from drug_batches where drug_id = $1`,
    [drugId],
  );
  if (num(count?.n) > 0) return;
  const [drug] = await query<{ quantity: number; batch_number: string; expiry_date: string }>(
    `select quantity, batch_number, expiry_date from drugs where id = $1`,
    [drugId],
  );
  if (!drug || num(drug.quantity) < 1) return;
  const expiry = text(drug.expiry_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return;
  await query(
    `insert into drug_batches (drug_id, lot_number, expiry_date, quantity) values ($1, $2, $3, $4)`,
    [drugId, text(drug.batch_number), expiry, num(drug.quantity)],
  );
}

export async function consumeFefo(query: QueryFn, drugId: number, baseQty: number): Promise<LotAllocation[]> {
  if (baseQty < 1) throw new ApiError(400, "Quantity must be at least 1.");
  await backfillLots(query, drugId);
  const today = kigaliToday();
  const rows = await query<{ id: number; lot_number: string; expiry_date: unknown; quantity: number; name: string }>(
    `select b.id, b.lot_number, b.expiry_date, b.quantity, d.name
     from drug_batches b
     join drugs d on d.id = b.drug_id
     where b.drug_id = $1 and b.quantity > 0
     order by b.expiry_date, b.id
     for update of b`,
    [drugId],
  );
  let need = baseQty;
  const used: LotAllocation[] = [];
  for (const row of rows) {
    const expiry = text(row.expiry_date).slice(0, 10);
    if (expiry < today) continue;
    const take = Math.min(need, num(row.quantity));
    if (take < 1) continue;
    await query(`update drug_batches set quantity = quantity - $1 where id = $2`, [take, num(row.id)]);
    used.push({ batchId: num(row.id), lotNumber: text(row.lot_number), expiryDate: expiry, quantity: take });
    need -= take;
    if (need === 0) break;
  }
  if (need > 0) {
    const name = text(rows[0]?.name) || "That drug";
    const expiredLeft = rows.some((row) => text(row.expiry_date).slice(0, 10) < today && num(row.quantity) > 0);
    const sellable = baseQty - need;
    if (sellable === 0 && expiredLeft) {
      throw new ApiError(409, `${name} on hand is expired and cannot leave the shelf.`);
    }
    throw new ApiError(409, `Only ${sellable} ${name} can be sold before expiry.`);
  }
  await syncDrugFromLots(query, drugId);
  return used;
}

export async function recordAdjustment(
  user: Staff,
  input: {
    drugId: number;
    kind: "return_restock" | "return_dispose" | "damaged" | "expired";
    quantity: number;
    reason: string;
    lotNumber?: string;
    expiryDate?: string;
    batchId?: number;
    saleId?: number;
  },
) {
  const { withTransaction } = await import("./db");
  return withTransaction(async (query) => {
    const reason = input.reason.trim();
    if (reason.length < 2) throw new ApiError(400, "Say why this stock is moving.");
    if (input.quantity < 1) throw new ApiError(400, "Quantity must be at least 1.");
    let batchId = input.batchId ?? null;
    if (input.kind === "return_restock") {
      const expiry = input.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(input.expiryDate) ? input.expiryDate : "";
      if (batchId) {
        await query(`update drug_batches set quantity = quantity + $1 where id = $2 and drug_id = $3`, [
          input.quantity,
          batchId,
          input.drugId,
        ]);
      } else {
        if (!expiry) throw new ApiError(400, "A restock needs the lot expiry, or an existing lot.");
        batchId = await addLot(query, input.drugId, {
          lotNumber: input.lotNumber ?? "",
          expiryDate: expiry,
          quantity: input.quantity,
        });
      }
      await syncDrugFromLots(query, input.drugId);
    } else if (input.kind === "return_dispose") {
      batchId = null;
    } else {
      await backfillLots(query, input.drugId);
      const today = kigaliToday();
      const rows = await query<{ id: number; expiry_date: unknown; quantity: number }>(
        `select id, expiry_date, quantity from drug_batches
         where drug_id = $1 and quantity > 0
           and ($2::int is null or id = $2)
         order by case when $3 = 'expired' and expiry_date < $4::date then 0 else 1 end, expiry_date, id
         for update`,
        [input.drugId, batchId, input.kind, today],
      );
      let need = input.quantity;
      let first: number | null = null;
      for (const row of rows) {
        if (input.kind === "expired" && text(row.expiry_date).slice(0, 10) >= today) continue;
        const take = Math.min(need, num(row.quantity));
        if (take < 1) continue;
        await query(`update drug_batches set quantity = quantity - $1 where id = $2`, [take, num(row.id)]);
        if (first == null) first = num(row.id);
        need -= take;
        if (need === 0) break;
      }
      if (need > 0) throw new ApiError(409, "There is not enough of that lot to write off.");
      batchId = first;
      await syncDrugFromLots(query, input.drugId);
    }
    const [row] = await query<{ id: number }>(
      `insert into stock_adjustments (drug_id, batch_id, kind, quantity, reason, sale_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [input.drugId, batchId, input.kind, input.quantity, reason, input.saleId ?? null, user.id],
    );
    await writeAudit(query, user, {
      action: input.kind,
      entity: "drug",
      entityId: input.drugId,
      summary: `${input.kind.replaceAll("_", " ")} of ${input.quantity}: ${reason}`,
    });
    return num(row.id);
  });
}

export async function listLots(drugId: number) {
  const rows = await sql<{ id: number; lot_number: string; expiry_date: unknown; quantity: number }>(
    `select id, lot_number, expiry_date, quantity from drug_batches
     where drug_id = $1 and quantity > 0
     order by expiry_date, id`,
    [drugId],
  );
  const today = kigaliToday();
  return rows.map((row) => {
    const expiryDate = text(row.expiry_date).slice(0, 10);
    return {
      id: num(row.id),
      lotNumber: text(row.lot_number),
      expiryDate,
      quantity: num(row.quantity),
      expired: expiryDate < today,
    };
  });
}
