import { assertAccess, can } from "./access";
import { writeAudit } from "./audit";
import { postSettledSale } from "./finance";
import { ensurePatient } from "./patients";
import { decodePhoto, photoBytes } from "./photo";
import { stampSale } from "./settings";
import { ensureSupplier } from "./suppliers";
import { addLot, consumeFefo, lotLabel } from "./lots";
import { coverageNote, persistCoverage, previewLineTotals, quoteCoverage } from "./insurance";
import { ensureGenericVariant, fiscalMark, resolveCategory, safetyWarnings } from "./shop-ops";
import { sql, withTransaction } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { QueryFn } from "./query";
import { addDays, kigaliToday } from "./time";
import { formatRwf } from "./format";
import type {
  DashboardData,
  Drug,
  Movement,
  PaymentReceipt,
  Prescription,
  PrescriptionFill,
  PrescriptionItem,
  PurchaseItem,
  PurchaseOrder,
  Role,
  Sale,
  Staff,
} from "./types";
import type { DrugInput, DrugUpdateInput, PrescriptionInput, PurchaseOrderInput, SaleInput } from "./validators";

type DrugRow = {
  id: number;
  name: string;
  generic_name: string;
  category: string;
  category_id: number | null;
  subcategory_id: number | null;
  subcategory: string | null;
  generic_id: number | null;
  variant_id: number | null;
  brand_name: string;
  manufacturer: string;
  barcode: string;
  rx_only: boolean;
  strip_size: number;
  strip_price: number;
  pack_price: number;
  form: string;
  strength: string;
  sku: string;
  unit_price: number;
  quantity: number;
  reorder_level: number;
  expiry_date: string;
  batch_number: string;
  supplier: string;
  base_unit: string;
  pack_unit: string;
  units_per_pack: number;
  on_order: number | null;
  allocated: number | null;
  has_photo?: boolean;
};

const drugSelect = `
  select
    d.id, d.name, d.generic_name, d.category, d.form, d.strength, d.sku,
    d.unit_price, d.quantity, d.reorder_level, d.expiry_date, d.batch_number, d.supplier,
    d.base_unit, d.pack_unit, d.units_per_pack,
    d.category_id, d.subcategory_id, sub.name as subcategory,
    d.generic_id, d.variant_id, d.brand_name, d.manufacturer, d.barcode, d.rx_only,
    d.strip_size, d.strip_price, d.pack_price,
    (d.photo is not null) as has_photo,
    coalesce(o.on_order, 0)::int as on_order,
    coalesce(a.allocated, 0)::int as allocated
  from drugs d
  left join subcategories sub on sub.id = d.subcategory_id
  left join (
    select i.drug_id, sum(i.quantity)::int as on_order
    from purchase_order_items i
    join purchase_orders p on p.id = i.order_id
    where p.status = 'ordered'
    group by i.drug_id
  ) o on o.drug_id = d.id
  left join (
    select i.drug_id, sum(i.quantity)::int as allocated
    from prescription_items i
    join prescriptions p on p.id = i.prescription_id
    where p.status = 'pending'
    group by i.drug_id
  ) a on a.drug_id = d.id
`;

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toDrug(row: DrugRow, today = kigaliToday()): Drug {
  const expiryDate = text(row.expiry_date).slice(0, 10);
  const soon = addDays(today, 30);
  const quantity = num(row.quantity);
  const reorderLevel = num(row.reorder_level);
  return {
    id: num(row.id),
    name: text(row.name),
    genericName: text(row.generic_name),
    category: text(row.category),
    categoryId: row.category_id == null ? null : num(row.category_id),
    subcategoryId: row.subcategory_id == null ? null : num(row.subcategory_id),
    subcategory: text(row.subcategory),
    genericId: row.generic_id == null ? null : num(row.generic_id),
    variantId: row.variant_id == null ? null : num(row.variant_id),
    brandName: text(row.brand_name) || text(row.name),
    manufacturer: text(row.manufacturer),
    barcode: text(row.barcode),
    rxOnly: row.rx_only === true,
    stripSize: Math.max(1, num(row.strip_size) || 10),
    stripPrice: num(row.strip_price),
    packPrice: num(row.pack_price),
    form: text(row.form),
    strength: text(row.strength),
    sku: text(row.sku),
    unitPrice: num(row.unit_price),
    quantity,
    reorderLevel,
    baseUnit: text(row.base_unit) || "tablet",
    packUnit: text(row.pack_unit) || "box",
    unitsPerPack: Math.max(1, num(row.units_per_pack)),
    allocated: num(row.allocated),
    expiryDate,
    batchNumber: text(row.batch_number),
    supplier: text(row.supplier),
    onOrder: num(row.on_order),
    low: quantity <= reorderLevel,
    expired: expiryDate < today,
    expiringSoon: expiryDate >= today && expiryDate <= soon,
    hasPhoto: row.has_photo === true,
  };
}

function assertUniqueDrugs(ids: number[]) {
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(400, "Each drug can appear once.");
  }
}

async function lockDrug(query: QueryFn, id: number) {
  const [row] = await query<DrugRow>(
    `select id, name, generic_name, category, form, strength, sku, unit_price, quantity,
            reorder_level, expiry_date, batch_number, supplier,
            base_unit, pack_unit, units_per_pack, rx_only, strip_size, strip_price, pack_price,
            0 as on_order, 0 as allocated
     from drugs where id = $1 for update`,
    [id],
  );
  if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
  return row;
}

export async function staffByEmail(email: string): Promise<Staff> {
  const [row] = await sql<{ id: number; name: string; email: string; role: Role }>(
    `select id, name, email, role from users where email = $1`,
    [email],
  );
  if (!row) throw new ApiError(404, "Staff account not found.");
  return { id: num(row.id), name: text(row.name), email: text(row.email), role: row.role };
}

export async function listDrugs(search = "", filter = "all"): Promise<Drug[]> {
  const today = kigaliToday();
  const soon = addDays(today, 30);
  const needle = search.trim().slice(0, 80);
  const allowed = new Set(["all", "low", "expiring", "expired"]);
  const chosen = allowed.has(filter) ? filter : "all";
  const rows = await sql<DrugRow>(
    `${drugSelect}
     where ($1 = '' or d.name ilike $2 or d.generic_name ilike $2 or d.brand_name ilike $2 or d.sku ilike $2 or d.barcode ilike $2 or d.category ilike $2)
       and (
         $3 = 'all'
         or ($3 = 'low' and d.quantity <= d.reorder_level)
         or ($3 = 'expired' and d.expiry_date < $4)
         or ($3 = 'expiring' and d.expiry_date >= $4 and d.expiry_date <= $5)
       )
     order by d.name`,
    [needle, `%${needle}%`, chosen, today, soon],
  );
  return rows.map((row) => toDrug(row, today));
}

export async function getDrug(id: number): Promise<{ drug: Drug; movements: Movement[] }> {
  const [row] = await sql<DrugRow>(`${drugSelect} where d.id = $1`, [id]);
  if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
  const movements = await sql<{ kind: "sale" | "receipt"; quantity: number; at: unknown; detail: string }>(
    `select * from (
       select 'sale'::text as kind, s.quantity, s.created_at as at,
              case when s.customer_name = '' then 'Walk-in sale' else 'Sale · ' || s.customer_name end as detail
       from sales s where s.drug_id = $1
       union all
       select 'receipt'::text, i.quantity, p.received_at,
              'Received from ' || p.supplier_name
       from purchase_order_items i
       join purchase_orders p on p.id = i.order_id
       where i.drug_id = $1 and p.status = 'received' and p.received_at is not null
     ) movements
     order by at desc
     limit 8`,
    [id],
  );
  return {
    drug: toDrug(row),
    movements: movements.map((movement) => ({
      kind: movement.kind,
      quantity: num(movement.quantity),
      at: text(movement.at),
      detail: text(movement.detail),
    })),
  };
}

function storedPhoto(value: string | null | undefined) {
  if (!value) return { bytes: null, type: "" };
  const photo = decodePhoto(value);
  return { bytes: photo.bytes, type: photo.type };
}

export async function getDrugPhoto(id: number): Promise<{ bytes: Uint8Array; type: string } | null> {
  const [row] = await sql<{ photo: unknown; photo_type: string }>(
    `select photo, photo_type from drugs where id = $1`,
    [id],
  );
  if (!row || row.photo == null) return null;
  return { bytes: photoBytes(row.photo), type: text(row.photo_type) || "image/jpeg" };
}

export async function getPrescriptionPhoto(id: number): Promise<{ bytes: Uint8Array; type: string } | null> {
  const [row] = await sql<{ photo: unknown; photo_type: string }>(
    `select photo, photo_type from prescriptions where id = $1`,
    [id],
  );
  if (!row || row.photo == null) return null;
  return { bytes: photoBytes(row.photo), type: text(row.photo_type) || "image/jpeg" };
}

function requireGeneric(name: string | undefined) {
  const cleaned = (name ?? "").trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) throw new ApiError(400, "Choose a generic group, or type a new one.");
  return cleaned;
}

export async function createDrug(user: Staff, input: DrugInput): Promise<Drug> {
  assertAccess(user.role, "inventory");
  const genericName = requireGeneric(input.genericName);
  const photo = storedPhoto(input.photo);
  try {
    const [row] = await sql<{ id: number }>(
      `insert into drugs (
        name, generic_name, category, form, strength, sku, unit_price, quantity,
        reorder_level, expiry_date, batch_number, supplier, photo, photo_type,
        base_unit, pack_unit, units_per_pack
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      returning id`,
      [
        input.name,
        genericName,
        input.category,
        input.form,
        input.strength,
        input.sku,
        input.unitPrice,
        input.openingQuantity,
        input.reorderLevel,
        input.expiryDate,
        input.batchNumber,
        input.supplier,
        photo.bytes,
        photo.type,
        input.baseUnit || "tablet",
        input.packUnit || "box",
        input.unitsPerPack && input.unitsPerPack >= 1 ? input.unitsPerPack : 1,
      ],
    );
    const category = await resolveCategory(sql, {
      categoryId: input.categoryId,
      category: input.category,
      subcategoryId: input.subcategoryId,
    });
    const grouped = await ensureGenericVariant(sql, {
      genericName,
      strength: input.strength ?? "",
      form: input.form,
    });
    await sql(
      `update drugs set
         category = $1, category_id = $2, subcategory_id = $3,
         generic_id = $4, variant_id = $5,
         brand_name = $6, manufacturer = $7, barcode = $8, rx_only = $9,
         strip_size = $10, strip_price = $11, pack_price = $12
       where id = $13`,
      [
        category.category,
        category.categoryId,
        category.subcategoryId,
        grouped.genericId,
        grouped.variantId,
        input.brandName || input.name,
        input.manufacturer ?? "",
        input.barcode ?? "",
        input.rxOnly ?? false,
        input.stripSize ?? 10,
        input.stripPrice ?? 0,
        input.packPrice ?? 0,
        row.id,
      ],
    );
    if (input.openingQuantity > 0) {
      await addLot(sql, row.id, {
        lotNumber: input.batchNumber ?? "",
        expiryDate: input.expiryDate,
        quantity: input.openingQuantity,
      });
    }
    const drug = (await getDrug(row.id)).drug;
    await writeAudit(sql, user, {
      action: "create",
      entity: "drug",
      entityId: drug.id,
      summary: `Added ${drug.name} ${drug.strength} (${drug.sku}) to the catalog.`,
      detail: drug.manufacturer ? `Brand ${drug.brandName}, made by ${drug.manufacturer}.` : `Brand ${drug.brandName}.`,
    });
    return drug;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That SKU is already in the catalog.");
    throw error;
  }
}

export async function updateDrug(user: Staff, id: number, input: DrugUpdateInput): Promise<Drug> {
  assertAccess(user.role, "inventory");
  const genericName = requireGeneric(input.genericName);
  try {
    const [row] = await sql<{ id: number }>(
      `update drugs set
        name = $1, generic_name = $2, category = $3, form = $4, strength = $5, sku = $6,
        unit_price = $7, reorder_level = $8, expiry_date = $9, batch_number = $10,
        supplier = $11,
        base_unit = coalesce($12, base_unit),
        pack_unit = coalesce($13, pack_unit),
        units_per_pack = coalesce($14, units_per_pack),
        updated_at = now()
       where id = $15
       returning id`,
      [
        input.name,
        genericName,
        input.category,
        input.form,
        input.strength,
        input.sku,
        input.unitPrice,
        input.reorderLevel,
        input.expiryDate,
        input.batchNumber,
        input.supplier,
        input.baseUnit || null,
        input.packUnit || null,
        input.unitsPerPack && input.unitsPerPack >= 1 ? input.unitsPerPack : null,
        id,
      ],
    );
    if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
    const category = await resolveCategory(sql, {
      categoryId: input.categoryId,
      category: input.category,
      subcategoryId: input.subcategoryId,
    });
    const grouped = await ensureGenericVariant(sql, {
      genericName,
      strength: input.strength ?? "",
      form: input.form,
    });
    await sql(
      `update drugs set
         category = $1, category_id = $2, subcategory_id = $3,
         generic_id = $4, variant_id = $5,
         brand_name = $6, manufacturer = $7, barcode = $8, rx_only = $9,
         strip_size = $10, strip_price = $11, pack_price = $12
       where id = $13`,
      [
        category.category,
        category.categoryId,
        category.subcategoryId,
        grouped.genericId,
        grouped.variantId,
        input.brandName || input.name,
        input.manufacturer ?? "",
        input.barcode ?? "",
        input.rxOnly ?? false,
        input.stripSize ?? 10,
        input.stripPrice ?? 0,
        input.packPrice ?? 0,
        id,
      ],
    );
    if (input.photo !== undefined) {
      const photo = storedPhoto(input.photo);
      await sql(`update drugs set photo = $1, photo_type = $2 where id = $3`, [photo.bytes, photo.type, id]);
    }
    const drug = (await getDrug(id)).drug;
    await writeAudit(sql, user, {
      action: "update",
      entity: "drug",
      entityId: id,
      summary: `Updated ${drug.name} ${drug.strength} (${drug.sku}).`,
      detail: `Price ${drug.unitPrice} RWF. Brand ${drug.brandName || drug.name}. Manufacturer ${drug.manufacturer || "not set"}.`,
    });
    return drug;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That SKU is already in the catalog.");
    throw error;
  }
}

export async function deleteDrug(user: Staff, id: number) {
  assertAccess(user.role, "deleteDrug");
  const [refs] = await sql<{ n: number }>(
    `select (
      (select count(*) from sales where drug_id = $1) +
      (select count(*) from prescription_items where drug_id = $1) +
      (select count(*) from purchase_order_items where drug_id = $1)
    )::int as n`,
    [id],
  );
  if (num(refs?.n) > 0) {
    throw new ApiError(409, "This drug has sales, prescriptions, or supplier orders, so it stays on the record.");
  }
  const [named] = await sql<{ name: string; sku: string }>(`select name, sku from drugs where id = $1`, [id]);
  const [row] = await sql<{ id: number }>(`delete from drugs where id = $1 returning id`, [id]);
  if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
  await writeAudit(sql, user, {
    action: "delete",
    entity: "drug",
    entityId: id,
    summary: `Removed ${named ? `${text(named.name)} (${text(named.sku)})` : "a drug"} from the catalog.`,
  });
}

export type BillLine = {
  name: string;
  strength: string;
  quantity: number;
  unitPrice: number;
  total: number;
  directions: string;
  lotLabel: string;
};

export type BillPayment = { method: string; amount: number };

export type Bill = {
  key: string;
  createdAt: string;
  customerName: string;
  sellerName: string;
  receiptNumbers: string[];
  lines: BillLine[];
  payments: BillPayment[];
  total: number;
  balance: number;
  fiscalNote: string;
};

export async function listBills(): Promise<Bill[]> {
  const rows = await sql(
    `select s.id, s.basket_id, s.quantity, s.unit_price, s.total, s.customer_name, s.created_at,
            s.receipt_number, s.directions, s.lot_label, s.fiscal_code,
            d.name as drug_name, d.strength, u.name as seller_name,
            coalesce(m.name, '') as payment_method_name,
            coalesce(m.settles_immediately, true) as settles_immediately
     from sales s
     join drugs d on d.id = s.drug_id
     join users u on u.id = s.sold_by
     left join payment_methods m on m.id = s.payment_method_id
     order by s.created_at desc, s.id desc
     limit 160`,
  );
  const saleIds = rows.map((row) => num(row.id));
  const collections = saleIds.length === 0
    ? []
    : await sql(
        `select c.sale_id, c.amount, m.name
         from collections c
         join payment_methods m on m.id = c.payment_method_id
         where c.sale_id = any($1::int[])
         order by c.id`,
        [saleIds],
      );
  const coveredRows = saleIds.length === 0
    ? []
    : await sql(
        `select sale_id, sum(insurer_amount)::int as covered from sale_coverages
         where sale_id = any($1::int[]) group by sale_id`,
        [saleIds],
      );
  const coveredBySale = new Map(coveredRows.map((row) => [num(row.sale_id), num(row.covered)]));
  const paidBySale = new Map<number, Array<{ name: string; amount: number }>>();
  for (const row of collections) {
    const id = num(row.sale_id);
    const list = paidBySale.get(id) ?? [];
    list.push({ name: text(row.name) || "Payment", amount: num(row.amount) });
    paidBySale.set(id, list);
  }
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.basket_id == null ? `sale-${num(row.id)}` : `basket-${num(row.basket_id)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const bills = [...groups.entries()].map(([key, group]): Bill => {
    const ordered = [...group].sort((left, right) => num(left.id) - num(right.id));
    const first = ordered[0];
    const total = ordered.reduce((sum, line) => sum + num(line.total), 0);
    const settles = ordered.every((line) => line.settles_immediately !== false);
    const collected = ordered.flatMap((line) => paidBySale.get(num(line.id)) ?? []);
    const amounts = new Map<string, number>();
    if (collected.length > 0) {
      for (const payment of collected) amounts.set(payment.name, (amounts.get(payment.name) ?? 0) + payment.amount);
    } else if (settles) {
      for (const line of ordered) {
        const method = text(line.payment_method_name) || "Payment";
        amounts.set(method, (amounts.get(method) ?? 0) + num(line.total));
      }
    }
    const paid = [...amounts.values()].reduce((sum, amount) => sum + amount, 0);
    const covered = ordered.reduce((sum, line) => sum + (coveredBySale.get(num(line.id)) ?? 0), 0);
    const fiscal = text(first?.fiscal_code);
    return {
      key,
      createdAt: text(ordered[ordered.length - 1]?.created_at),
      customerName: text(first?.customer_name),
      sellerName: text(first?.seller_name),
      receiptNumbers: ordered.map((line) => text(line.receipt_number)).filter(Boolean),
      lines: ordered.map((line) => ({
        name: text(line.drug_name),
        strength: text(line.strength),
        quantity: num(line.quantity),
        unitPrice: num(line.unit_price),
        total: num(line.total),
        directions: text(line.directions),
        lotLabel: text(line.lot_label),
      })),
      payments: [...amounts.entries()].map(([method, amount]) => ({ method, amount })),
      total,
      balance: Math.max(0, total - paid - covered),
      fiscalNote: fiscal ? `Local fiscal mark ${fiscal}. Not an RRA-signed EBM receipt.` : "",
    };
  });
  bills.sort((left, right) => (left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0));
  return bills.slice(0, 80);
}

export async function listSales(): Promise<Sale[]> {
  const rows = await sql(
    `select s.id, s.drug_id, d.name as drug_name, d.strength, s.quantity, s.unit_price, s.total,
            s.customer_name, u.name as seller_name, s.prescription_id, s.created_at,
            s.receipt_number, coalesce(m.name, '') as payment_method_name,
            coalesce(m.settles_immediately, true) as settles_immediately,
            s.directions, s.lot_label, s.basket_id, s.fiscal_code
     from sales s
     join drugs d on d.id = s.drug_id
     join users u on u.id = s.sold_by
     left join payment_methods m on m.id = s.payment_method_id
     order by s.created_at desc
     limit 80`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    drugId: num(row.drug_id),
    drugName: text(row.drug_name),
    strength: text(row.strength),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    total: num(row.total),
    customerName: text(row.customer_name),
    sellerName: text(row.seller_name),
    prescriptionId: row.prescription_id == null ? null : num(row.prescription_id),
    createdAt: text(row.created_at),
    receiptNumber: text(row.receipt_number),
    paymentMethodName: text(row.payment_method_name),
    settlesImmediately: row.settles_immediately !== false,
    directions: text(row.directions),
    lotLabel: text(row.lot_label),
    basketId: row.basket_id == null ? null : num(row.basket_id),
    fiscalCode: text(row.fiscal_code),
  }));
}

export async function recordSale(user: Staff, input: SaleInput) {
  assertAccess(user.role, "sales");
  return withTransaction(async (query) => {
    const drug = await lockDrug(query, input.drugId);
    const soldAs = input.soldAs ?? "base";
    const perPack = Math.max(1, num(drug.units_per_pack));
    const perStrip = Math.max(1, num(drug.strip_size) || 10);
    let unitPrice = num(drug.unit_price);
    let baseQty = input.quantity;
    if (soldAs === "pack") {
      const packPrice = num(drug.pack_price) > 0 ? num(drug.pack_price) : unitPrice * perPack;
      unitPrice = Math.max(0, Math.round(packPrice / perPack));
      baseQty = input.quantity * perPack;
    } else if (soldAs === "strip") {
      const stripPrice = num(drug.strip_price) > 0 ? num(drug.strip_price) : unitPrice * perStrip;
      unitPrice = Math.max(0, Math.round(stripPrice / perStrip));
      baseQty = input.quantity * perStrip;
    }
    const customerName = (input.customerName ?? "").trim();
    const patientMatches = input.patientId
      ? [{ id: input.patientId }]
      : customerName
        ? await query<{ id: number }>(
            `select id from patients where lower(name) = lower($1) order by id limit 2`,
            [customerName],
          )
        : [];
    const patientId = patientMatches.length === 1 ? num(patientMatches[0].id) : null;
    const warnings = await safetyWarnings(query, input.drugId, patientId);
    if (warnings.length > 0 && !input.acknowledgeRisks) {
      throw new ApiError(409, warnings.join(" "));
    }
    const lots = await consumeFefo(query, input.drugId, baseQty);
    if (drug.rx_only && !input.prescriptionId) {
      throw new ApiError(409, `${text(drug.name)} is prescription-only. File the script number, doctor, and facility before it can leave the shelf.`);
    }
    const priced = await stampSale(query, {
      unitPrice,
      quantity: baseQty,
      paymentMethodId: input.paymentMethodId,
    });
    const [profile] = await query<{ tin: string; ebm_serial: string }>(
      `select tin, ebm_serial from business_profile where id = 1`,
    );
    const fiscal = fiscalMark({
      receiptNumber: priced.receiptNumber,
      total: priced.total,
      tin: text(profile?.tin),
      at: new Date().toISOString(),
      ebmSerial: text(profile?.ebm_serial),
    });
    const directions = [input.dose, input.route, input.frequency, input.duration, input.directions].filter(Boolean).join(" · ");
    const [sale] = await query<{ id: number; created_at: unknown }>(
      `insert into sales (
         drug_id, quantity, unit_price, total, customer_name, sold_by, patient_id,
         payment_method_id, currency_id, receipt_number, sold_as,
         directions, dose, route, frequency, duration, fiscal_code, lot_label, prescription_id
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       returning id, created_at`,
      [
        input.drugId,
        baseQty,
        unitPrice,
        priced.total,
        customerName,
        user.id,
        patientId,
        priced.paymentMethodId,
        priced.currencyId,
        priced.receiptNumber,
        soldAs,
        directions,
        input.dose ?? "",
        input.route ?? "",
        input.frequency ?? "",
        input.duration ?? "",
        fiscal.code,
        lotLabel(lots),
        input.prescriptionId ?? null,
      ],
    );
    for (const lot of lots) {
      await query(
        `insert into sale_allocations (sale_id, batch_id, quantity) values ($1, $2, $3)`,
        [num(sale.id), lot.batchId, lot.quantity],
      );
    }
    await postSettledSale(query, {
      saleId: num(sale.id),
      total: priced.total,
      paymentMethodId: priced.paymentMethodId,
      settlesImmediately: priced.settlesImmediately,
      userId: user.id,
    });
    await writeAudit(query, user, {
      action: "create",
      entity: "sale",
      entityId: num(sale.id),
      summary: `Sold ${baseQty} ${text(drug.base_unit) || "base units"} of ${text(drug.name)} on ${priced.receiptNumber}.`,
    });
    const receipt: PaymentReceipt = {
      numbers: [priced.receiptNumber],
      issuedAt: text(sale.created_at),
      customerName,
      sellerName: user.name,
      paymentMethodName: priced.paymentMethodName,
      settlesImmediately: priced.settlesImmediately,
      lines: [
        {
          name: text(drug.name),
          strength: text(drug.strength),
          quantity: baseQty,
          unitPrice,
          total: priced.total,
          directions,
          lotLabel: lotLabel(lots),
        },
      ],
      fiscalNote: fiscal.note,
    };
    const [left] = await query<{ quantity: number }>(`select quantity from drugs where id = $1`, [input.drugId]);
    return {
      id: num(sale.id),
      total: priced.total,
      quantityLeft: num(left?.quantity),
      receipt,
    };
  });
}

async function applyCounterTenders(
  user: Staff,
  sales: Array<{ id: number; total: number }>,
  tenders: Array<{ paymentMethodId: number; amount: number }>,
  total: number,
) {
  const paid = tenders.reduce((sum, tender) => sum + tender.amount, 0);
  if (paid > total) throw new ApiError(400, `The amount paid is more than the ${formatRwf(total)} bill.`);
  const ids = tenders.map((tender) => tender.paymentMethodId);
  const methods = await sql<{ id: number; name: string; settles_immediately: boolean; active: boolean }>(
    `select id, name, settles_immediately, active from payment_methods where id = any($1::int[])`,
    [ids],
  );
  for (const tender of tenders) {
    const method = methods.find((item) => num(item.id) === tender.paymentMethodId);
    if (!method || !method.active || method.settles_immediately === false) {
      throw new ApiError(400, "Take a payment in a method that is paid now, such as cash or mobile money.");
    }
  }
  const open = sales.map((sale) => ({ id: sale.id, remaining: sale.total }));
  for (const tender of tenders) {
    let left = tender.amount;
    for (const sale of open) {
      if (left < 1 || sale.remaining < 1) continue;
      const take = Math.min(left, sale.remaining);
      await sql(
        `insert into collections (sale_id, amount, payment_method_id, collected_by) values ($1, $2, $3, $4)`,
        [sale.id, take, tender.paymentMethodId, user.id],
      );
      await sql(
        `insert into ledger_entries (kind, direction, amount, payment_method_id, sale_id, note, created_by)
         values ('collection', 'in', $1, $2, $3, 'Paid at the counter', $4)`,
        [take, tender.paymentMethodId, sale.id, user.id],
      );
      sale.remaining -= take;
      left -= take;
    }
  }
  const label = tenders
    .map((tender) => {
      const method = methods.find((item) => num(item.id) === tender.paymentMethodId);
      return `${text(method?.name) || "Payment"} ${formatRwf(tender.amount)}`;
    })
    .join(" · ");
  return { paid, label };
}

export async function recordBasket(
  user: Staff,
  input: {
    customerName: string;
    paymentMethodId: number;
    patientId?: number | null;
    memberNumber?: string;
    acknowledgeRisks?: boolean;
    lines: SaleInput[];
    tenders?: Array<{ paymentMethodId: number; amount: number }>;
  },
) {
  assertAccess(user.role, "sales");
  const memberNumber = (input.memberNumber ?? "").trim();
  const cover = memberNumber
    ? await quoteCoverage({
        memberNumber,
        lines: await previewLineTotals(input.lines),
        acknowledgeRisks: input.acknowledgeRisks,
        patientId: input.patientId,
      })
    : null;
  const customerName = input.customerName.trim() || cover?.patientName || "";
  const patientId = input.patientId ?? cover?.patientId ?? null;
  let paymentMethodId = input.paymentMethodId;
  if (cover && cover.insurerAmount > 0) {
    const [credit] = await sql<{ id: number }>(
      `select id from payment_methods where kind = 'credit' and active order by id limit 1`,
    );
    if (!credit) throw new ApiError(400, "Add a credit payment method so the insurer share stays off the cash drawer.");
    paymentMethodId = num(credit.id);
  }
  const pending = user.role === "dispenser";
  const [basket] = await sql<{ id: number }>(
    `insert into baskets (customer_name, patient_id, payment_method_id, sold_by, status)
     values ($1, $2, $3, $4, $5) returning id`,
    [customerName, patientId, paymentMethodId, user.id, pending ? "pending_check" : "completed"],
  );
  const receipt: PaymentReceipt = {
    numbers: [],
    issuedAt: "",
    customerName,
    sellerName: user.name,
    paymentMethodName: "",
    settlesImmediately: true,
    lines: [],
  };
  const postedSales: Array<{ id: number; total: number }> = [];
  for (const line of input.lines) {
    const posted = await recordSale(user, {
      ...line,
      customerName,
      paymentMethodId,
      patientId,
      acknowledgeRisks: input.acknowledgeRisks,
    });
    await sql(`update sales set basket_id = $1 where id = $2`, [num(basket.id), posted.id]);
    postedSales.push({ id: posted.id, total: posted.total });
    receipt.numbers.push(...posted.receipt.numbers);
    receipt.issuedAt = posted.receipt.issuedAt;
    receipt.paymentMethodName = posted.receipt.paymentMethodName;
    receipt.settlesImmediately = posted.receipt.settlesImmediately;
    receipt.fiscalNote = posted.receipt.fiscalNote;
    receipt.lines.push(...posted.receipt.lines);
  }
  if (pending) {
    receipt.fiscalNote = `${receipt.fiscalNote ?? ""} A pharmacist still needs to check this sale.`.trim();
  }
  const total = receipt.lines.reduce((sum, line) => sum + line.total, 0);
  if (cover) {
    await persistCoverage(user, cover, postedSales.map((sale) => sale.id), `basket-${num(basket.id)}`);
    receipt.fiscalNote = `${receipt.fiscalNote ?? ""} ${coverageNote(cover)}`.trim();
  }
  const [original] = await sql<{ settles_immediately: boolean }>(
    `select settles_immediately from payment_methods where id = $1`,
    [input.paymentMethodId],
  );
  const patientTenders = input.tenders && input.tenders.length > 0
    ? input.tenders
    : cover && cover.insurerAmount > 0 && original?.settles_immediately !== false && cover.patientPayable > 0
      ? [{ paymentMethodId: input.paymentMethodId, amount: cover.patientPayable }]
      : [];
  if (cover && patientTenders.reduce((sum, tender) => sum + tender.amount, 0) > cover.patientPayable) {
    throw new ApiError(400, `After insurance the patient owes ${formatRwf(cover.patientPayable)}.`);
  }
  if (patientTenders.length > 0 && !receipt.settlesImmediately) {
    const allocation = cover
      ? postedSales.map((sale, index) => ({ id: sale.id, total: cover.lines[index]?.patientPayable ?? sale.total }))
      : postedSales;
    const cap = cover ? cover.patientPayable : total;
    const payment = await applyCounterTenders(user, allocation, patientTenders, cap);
    const due = cover ? cover.patientPayable : total;
    receipt.paymentMethodName = payment.label;
    receipt.settlesImmediately = payment.paid >= due;
    if (payment.paid < due) {
      receipt.fiscalNote = `${receipt.fiscalNote ?? ""} Paid ${formatRwf(payment.paid)}. ${formatRwf(due - payment.paid)} stays on the bill.`.trim();
    }
  }
  return { id: num(basket.id), pending, receipt };
}

async function prescriptionItems(ids: number[]): Promise<Map<number, PrescriptionItem[]>> {
  const grouped = new Map<number, PrescriptionItem[]>();
  if (ids.length === 0) return grouped;
  const rows = await sql(
    `select i.id, i.prescription_id, i.drug_id, d.name as drug_name, d.strength, i.quantity,
            i.dosage, i.unit_price, d.quantity as on_hand, d.expiry_date
     from prescription_items i
     join drugs d on d.id = i.drug_id
     where i.prescription_id = any($1::int[])
     order by i.id`,
    [ids],
  );
  for (const row of rows) {
    const prescriptionId = num(row.prescription_id);
    const item: PrescriptionItem = {
      id: num(row.id),
      drugId: num(row.drug_id),
      drugName: text(row.drug_name),
      strength: text(row.strength),
      quantity: num(row.quantity),
      dosage: text(row.dosage),
      unitPrice: num(row.unit_price),
      onHand: num(row.on_hand),
      expiryDate: text(row.expiry_date).slice(0, 10),
    };
    const list = grouped.get(prescriptionId) ?? [];
    list.push(item);
    grouped.set(prescriptionId, list);
  }
  return grouped;
}

function refillsRemaining(allowed: number, used: number) {
  if (used === 0) return allowed;
  return Math.max(0, allowed - (used - 1));
}

async function prescriptionFills(ids: number[]): Promise<Map<number, PrescriptionFill[]>> {
  const grouped = new Map<number, PrescriptionFill[]>();
  if (ids.length === 0) return grouped;
  const rows = await sql(
    `select f.id, f.prescription_id, f.fill_number, f.created_at, u.name as dispensed_by_name
     from prescription_fills f
     join users u on u.id = f.dispensed_by
     where f.prescription_id = any($1::int[])
     order by f.fill_number`,
    [ids],
  );
  for (const row of rows) {
    const prescriptionId = num(row.prescription_id);
    const list = grouped.get(prescriptionId) ?? [];
    list.push({
      id: num(row.id),
      fillNumber: num(row.fill_number),
      dispensedByName: text(row.dispensed_by_name),
      createdAt: text(row.created_at),
    });
    grouped.set(prescriptionId, list);
  }
  return grouped;
}

function mapPrescription(
  row: Record<string, unknown>,
  items: PrescriptionItem[],
  fills: PrescriptionFill[],
): Prescription {
  const refillsAllowed = num(row.refills_allowed);
  return {
    id: num(row.id),
    patientId: row.patient_id == null ? null : num(row.patient_id),
    patientName: text(row.patient_name),
    patientPhone: text(row.patient_phone),
    doctorName: text(row.doctor_name),
    facility: text(row.facility),
    prescriptionNumber: text(row.prescription_number),
    hasPhoto: row.photo != null || row.has_photo === true,
    notes: text(row.notes),
    status: text(row.status) as Prescription["status"],
    refillsAllowed,
    fillsUsed: fills.length,
    refillsRemaining: refillsRemaining(refillsAllowed, fills.length),
    createdByName: text(row.created_by_name),
    dispensedByName: row.dispensed_by_name == null ? null : text(row.dispensed_by_name),
    dispensedAt: row.dispensed_at == null ? null : text(row.dispensed_at),
    createdAt: text(row.created_at),
    items,
    fills,
  };
}

export async function listPrescriptions(): Promise<Prescription[]> {
  const rows = await sql(
    `select p.id, p.patient_id, p.patient_name, p.patient_phone, p.doctor_name, p.facility,
            p.prescription_number, p.notes, p.status, p.refills_allowed, p.created_by, p.dispensed_by,
            p.dispensed_at, p.created_at, (p.photo is not null) as has_photo,
            creator.name as created_by_name, dispenser.name as dispensed_by_name
     from prescriptions p
     join users creator on creator.id = p.created_by
     left join users dispenser on dispenser.id = p.dispensed_by
     order by p.created_at desc
     limit 100`,
  );
  const ids = rows.map((row) => num(row.id));
  const items = await prescriptionItems(ids);
  const fills = await prescriptionFills(ids);
  return rows.map((row) => mapPrescription(row, items.get(num(row.id)) ?? [], fills.get(num(row.id)) ?? []));
}

export async function createPrescription(user: Staff, input: PrescriptionInput): Promise<Prescription> {
  assertAccess(user.role, "prescriptions");
  assertUniqueDrugs(input.items.map((item) => item.drugId));
  const id = await withTransaction(async (query) => {
    const patientId = await ensurePatient(query, user, {
      name: input.patientName,
      phone: input.patientPhone ?? "",
    });
    const photo = storedPhoto(input.photo);
    const [header] = await query<{ id: number }>(
      `insert into prescriptions (
         patient_id, patient_name, patient_phone, doctor_name, facility, prescription_number,
         notes, status, refills_allowed, days_supply, created_by, photo, photo_type
       ) values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12)
       returning id`,
      [
        patientId,
        input.patientName,
        input.patientPhone ?? "",
        input.doctorName ?? "",
        input.facility ?? "",
        input.prescriptionNumber ?? "",
        input.notes ?? "",
        input.refillsAllowed ?? 0,
        input.daysSupply ?? 0,
        user.id,
        photo.bytes,
        photo.type,
      ],
    );
    await writeAudit(query, user, {
      action: "create",
      entity: "prescription",
      entityId: num(header.id),
      summary: `Filed a prescription for ${input.patientName} with ${input.refillsAllowed ?? 0} refill${(input.refillsAllowed ?? 0) === 1 ? "" : "s"}.`,
    });
    for (const item of input.items) {
      const [drug] = await query<{ unit_price: number }>(
        `select unit_price from drugs where id = $1`,
        [item.drugId],
      );
      if (!drug) throw new ApiError(400, "One of the drugs is no longer in the catalog.");
      await query(
        `insert into prescription_items (prescription_id, drug_id, quantity, dosage, unit_price)
         values ($1, $2, $3, $4, $5)`,
        [header.id, item.drugId, item.quantity, item.dosage, num(drug.unit_price)],
      );
    }
    return num(header.id);
  });
  const [created] = (await listPrescriptions()).filter((item) => item.id === id);
  return created;
}

async function writeFill(
  query: QueryFn,
  user: Staff,
  prescription: { id: number; patient_name: string; patient_id: number | null },
  paymentMethodId: number | undefined,
  fillNumber: number,
) {
  const items = await query<{ drug_id: number; quantity: number; unit_price: number; dosage: string }>(
    `select drug_id, quantity, unit_price, dosage from prescription_items where prescription_id = $1 order by drug_id`,
    [prescription.id],
  );
  if (items.length === 0) throw new ApiError(409, "This prescription has no drugs.");
  const [fill] = await query<{ id: number }>(
    `insert into prescription_fills (prescription_id, fill_number, dispensed_by)
     values ($1, $2, $3)
     returning id`,
    [prescription.id, fillNumber, user.id],
  );
  const receipt: PaymentReceipt = {
    numbers: [],
    issuedAt: "",
    customerName: text(prescription.patient_name),
    sellerName: user.name,
    paymentMethodName: "",
    settlesImmediately: true,
    lines: [],
  };
  for (const item of items) {
    const drug = await lockDrug(query, num(item.drug_id));
    const lots = await consumeFefo(query, num(item.drug_id), num(item.quantity));
    const priced = await stampSale(query, {
      unitPrice: num(item.unit_price),
      quantity: num(item.quantity),
      paymentMethodId,
    });
    const [sale] = await query<{ id: number; created_at: unknown }>(
      `insert into sales (
         drug_id, quantity, unit_price, total, customer_name, sold_by, prescription_id,
         fill_id, patient_id, payment_method_id, currency_id, receipt_number
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id, created_at`,
      [
        num(item.drug_id),
        num(item.quantity),
        num(item.unit_price),
        priced.total,
        text(prescription.patient_name),
        user.id,
        prescription.id,
        num(fill.id),
        prescription.patient_id,
        priced.paymentMethodId,
        priced.currencyId,
        priced.receiptNumber,
      ],
    );
    await query(`update sales set directions = $1, lot_label = $2 where id = $3`, [
      text(item.dosage),
      lotLabel(lots),
      num(sale.id),
    ]);
    for (const lot of lots) {
      await query(`insert into sale_allocations (sale_id, batch_id, quantity) values ($1, $2, $3)`, [
        num(sale.id),
        lot.batchId,
        lot.quantity,
      ]);
    }
    await postSettledSale(query, {
      saleId: num(sale.id),
      total: priced.total,
      paymentMethodId: priced.paymentMethodId,
      settlesImmediately: priced.settlesImmediately,
      userId: user.id,
    });
    if (!receipt.issuedAt) receipt.issuedAt = text(sale.created_at);
    receipt.numbers.push(priced.receiptNumber);
    receipt.paymentMethodName = priced.paymentMethodName;
    receipt.settlesImmediately = priced.settlesImmediately;
    receipt.lines.push({
      name: text(drug.name),
      strength: text(drug.strength),
      quantity: num(item.quantity),
      unitPrice: num(item.unit_price),
      total: priced.total,
      directions: text(item.dosage),
      lotLabel: lotLabel(lots),
    });
  }
  return receipt;
}

export async function dispensePrescription(user: Staff, id: number, paymentMethodId?: number): Promise<PaymentReceipt> {
  assertAccess(user.role, "prescriptions");
  return withTransaction(async (query) => {
    const [prescription] = await query<{ id: number; status: string; patient_name: string; patient_id: number | null }>(
      `select id, status, patient_name, patient_id from prescriptions where id = $1 for update`,
      [id],
    );
    if (!prescription) throw new ApiError(404, "Prescription not found.");
    if (prescription.status !== "pending") {
      throw new ApiError(409, "Only a pending prescription can be dispensed.");
    }
    const receipt = await writeFill(query, user, prescription, paymentMethodId, 1);
    await query(
      `update prescriptions set status = 'dispensed', dispensed_by = $1, dispensed_at = now() where id = $2`,
      [user.id, id],
    );
    await writeAudit(query, user, {
      action: "dispense",
      entity: "prescription",
      entityId: id,
      summary: `Dispensed the first fill for ${text(prescription.patient_name)}.`,
    });
    return receipt;
  });
}

export async function refillPrescription(user: Staff, id: number, paymentMethodId?: number): Promise<PaymentReceipt> {
  assertAccess(user.role, "prescriptions");
  return withTransaction(async (query) => {
    const [prescription] = await query<{
      id: number;
      status: string;
      patient_name: string;
      patient_id: number | null;
      refills_allowed: number;
      days_supply: number;
    }>(
      `select id, status, patient_name, patient_id, refills_allowed, days_supply from prescriptions where id = $1 for update`,
      [id],
    );
    if (!prescription) throw new ApiError(404, "Prescription not found.");
    if (prescription.status === "pending") throw new ApiError(409, "Dispense this prescription once before a refill.");
    if (prescription.status !== "dispensed") throw new ApiError(409, "A cancelled prescription cannot be refilled.");
    const [count] = await query<{ n: number }>(
      `select count(*)::int as n from prescription_fills where prescription_id = $1`,
      [id],
    );
    const used = num(count?.n);
    const allowed = num(prescription.refills_allowed);
    if (used >= 1 + allowed) throw new ApiError(409, "No refills are left on this prescription.");
    const supply = num(prescription.days_supply);
    if (supply > 0) {
      const [last] = await query<{ created_at: unknown }>(
        `select created_at from prescription_fills where prescription_id = $1 order by fill_number desc limit 1`,
        [id],
      );
      if (last) {
        const lastDay = text(last.created_at).slice(0, 10);
        const earliest = addDays(lastDay, supply);
        if (kigaliToday() < earliest) {
          throw new ApiError(409, `This refill is early. The last fill covers ${supply} days, until ${earliest}.`);
        }
      }
    }
    const fillNumber = used + 1;
    const receipt = await writeFill(query, user, prescription, paymentMethodId, fillNumber);
    await writeAudit(query, user, {
      action: "refill",
      entity: "prescription",
      entityId: id,
      summary: `Dispensed refill ${fillNumber - 1} of ${allowed} for ${text(prescription.patient_name)}.`,
    });
    return receipt;
  });
}

export async function cancelPrescription(user: Staff, id: number) {
  assertAccess(user.role, "prescriptions");
  const [row] = await sql<{ id: number }>(
    `update prescriptions set status = 'cancelled'
     where id = $1 and status = 'pending'
     returning id`,
    [id],
  );
  if (!row) {
    const [existing] = await sql<{ id: number }>(`select id from prescriptions where id = $1`, [id]);
    if (!existing) throw new ApiError(404, "Prescription not found.");
    throw new ApiError(409, "Only a pending prescription can be cancelled.");
  }
  await writeAudit(sql, user, {
    action: "cancel",
    entity: "prescription",
    entityId: id,
    summary: `Cancelled prescription ${id}.`,
  });
}

async function orderItems(ids: number[]): Promise<Map<number, PurchaseItem[]>> {
  const grouped = new Map<number, PurchaseItem[]>();
  if (ids.length === 0) return grouped;
  const rows = await sql(
    `select i.id, i.order_id, i.drug_id, d.name as drug_name, d.strength, i.quantity,
            i.unit_cost, i.expiry_date, i.batch_number
     from purchase_order_items i
     join drugs d on d.id = i.drug_id
     where i.order_id = any($1::int[])
     order by i.id`,
    [ids],
  );
  for (const row of rows) {
    const orderId = num(row.order_id);
    const quantity = num(row.quantity);
    const unitCost = num(row.unit_cost);
    const item: PurchaseItem = {
      id: num(row.id),
      drugId: num(row.drug_id),
      drugName: text(row.drug_name),
      strength: text(row.strength),
      quantity,
      unitCost,
      expiryDate: row.expiry_date == null || text(row.expiry_date) === "" ? null : text(row.expiry_date).slice(0, 10),
      batchNumber: text(row.batch_number),
      lineTotal: quantity * unitCost,
    };
    const list = grouped.get(orderId) ?? [];
    list.push(item);
    grouped.set(orderId, list);
  }
  return grouped;
}

function mapOrder(row: Record<string, unknown>, items: PurchaseItem[]): PurchaseOrder {
  return {
    id: num(row.id),
    supplierName: text(row.supplier_name),
    status: text(row.status) as PurchaseOrder["status"],
    notes: text(row.notes),
    orderedByName: text(row.ordered_by_name),
    receivedByName: row.received_by_name == null ? null : text(row.received_by_name),
    orderedAt: text(row.ordered_at),
    receivedAt: row.received_at == null ? null : text(row.received_at),
    items,
    totalCost: items.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const rows = await sql(
    `select p.*, orderer.name as ordered_by_name, receiver.name as received_by_name
     from purchase_orders p
     join users orderer on orderer.id = p.ordered_by
     left join users receiver on receiver.id = p.received_by
     where p.status <> 'draft'
     order by p.ordered_at desc
     limit 80`,
  );
  const items = await orderItems(rows.map((row) => num(row.id)));
  return rows.map((row) => mapOrder(row, items.get(num(row.id)) ?? []));
}

export async function createPurchaseOrder(user: Staff, input: PurchaseOrderInput): Promise<PurchaseOrder> {
  assertAccess(user.role, "orders");
  assertUniqueDrugs(input.items.map((item) => item.drugId));
  const id = await withTransaction(async (query) => {
    for (const item of [...input.items].sort((a, b) => a.drugId - b.drugId)) {
      const [drug] = await query<{ id: number }>(`select id from drugs where id = $1`, [item.drugId]);
      if (!drug) throw new ApiError(400, "One of the drugs is no longer in the catalog.");
    }
    const supplier = await ensureSupplier(query, input.supplierName);
    const [order] = await query<{ id: number }>(
      `insert into purchase_orders (supplier_id, supplier_name, status, notes, ordered_by)
       values ($1, $2, 'ordered', $3, $4)
       returning id`,
      [supplier.id, supplier.name, input.notes, user.id],
    );
    await writeAudit(query, user, {
      action: "create",
      entity: "order",
      entityId: num(order.id),
      summary: `Ordered from ${supplier.name}.`,
    });
    for (const item of input.items) {
      const [pack] = await query<{ units_per_pack: number }>(
        `select units_per_pack from drugs where id = $1`,
        [item.drugId],
      );
      const per = Math.max(1, num(pack?.units_per_pack));
      const quantity = item.packs != null ? item.packs * per : item.quantity;
      if (!quantity) throw new ApiError(400, "Enter packs or a base-unit quantity.");
      await query(
        `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, expiry_date, batch_number, entered_packs)
         values ($1, $2, $3, $4, nullif($5, ''), $6, $7)`,
        [order.id, item.drugId, quantity, item.unitCost, item.expiryDate, item.batchNumber, item.packs ?? null],
      );
    }
    return num(order.id);
  });
  const [created] = (await listPurchaseOrders()).filter((order) => order.id === id);
  return created;
}

export async function receivePurchaseOrder(user: Staff, id: number) {
  assertAccess(user.role, "orders");
  await withTransaction(async (query) => {
    const [order] = await query<{ id: number; status: string; supplier_name: string }>(
      `select id, status, supplier_name from purchase_orders where id = $1 for update`,
      [id],
    );
    if (!order) throw new ApiError(404, "Supplier order not found.");
    if (order.status === "draft") throw new ApiError(409, "Send the draft before receiving it.");
    if (order.status !== "ordered") {
      throw new ApiError(409, "Only an open supplier order can be received.");
    }
    const items = await query<{
      drug_id: number;
      quantity: number;
      expiry_date: string | null;
      batch_number: string;
    }>(
      `select drug_id, quantity, expiry_date, batch_number
       from purchase_order_items where order_id = $1 order by drug_id`,
      [id],
    );
    if (items.length === 0) throw new ApiError(409, "This order has no lines.");
    for (const item of items) {
      await lockDrug(query, num(item.drug_id));
      let expiry = item.expiry_date ? text(item.expiry_date).slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        const [current] = await query<{ expiry_date: string }>(`select expiry_date from drugs where id = $1`, [num(item.drug_id)]);
        expiry = text(current?.expiry_date).slice(0, 10);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        throw new ApiError(400, "Each received line needs an expiry date so the lot can be tracked.");
      }
      await addLot(query, num(item.drug_id), {
        lotNumber: text(item.batch_number),
        expiryDate: expiry,
        quantity: num(item.quantity),
      });
      await query(
        `update drugs set supplier = $1, expiry_date = $2, batch_number = $3, updated_at = now() where id = $4`,
        [text(order.supplier_name), expiry, text(item.batch_number), num(item.drug_id)],
      );
    }
    await query(
      `update purchase_orders set status = 'received', received_by = $1, received_at = now() where id = $2`,
      [user.id, id],
    );
    await writeAudit(query, user, {
      action: "receive",
      entity: "order",
      entityId: id,
      summary: `Received the order from ${text(order.supplier_name)}.`,
    });
  });
}

export async function listSupplierNames(): Promise<string[]> {
  const rows = await sql<{ name: string }>(
    `select name
     from (
       select distinct on (lower(btrim(name))) btrim(name) as name
       from (
         select name, 0 as source_rank from suppliers
         union all
         select supplier, 1 from drugs
         union all
         select supplier_name, 2 from purchase_orders
       ) raw
       where btrim(name) <> ''
       order by lower(btrim(name)), source_rank, btrim(name)
     ) deduped
     order by lower(name), name`,
  );
  return rows.map((row) => text(row.name));
}

export async function createSupplier(user: Staff, name: string): Promise<{ name: string; created: boolean }> {
  assertAccess(user.role, "orders");
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) throw new ApiError(400, "Enter the supplier.");
  if (cleaned.length > 80) throw new ApiError(400, "That supplier name is too long.");

  const [existing] = await sql<{ name: string }>(
    `select name from suppliers where lower(name) = lower($1) limit 1`,
    [cleaned],
  );
  if (existing) return { name: text(existing.name), created: false };

  try {
    const saved = await ensureSupplier(sql, cleaned);
    await writeAudit(sql, user, {
      action: "create",
      entity: "supplier",
      entityId: saved.id,
      summary: `Added supplier ${saved.name}.`,
    });
    return { name: saved.name, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [again] = await sql<{ name: string }>(
      `select name from suppliers where lower(name) = lower($1) limit 1`,
      [cleaned],
    );
    if (!again) throw error;
    return { name: text(again.name), created: false };
  }
}

export async function cancelPurchaseOrder(user: Staff, id: number) {
  assertAccess(user.role, "orders");
  const [row] = await sql<{ id: number }>(
    `update purchase_orders set status = 'cancelled'
     where id = $1 and status in ('ordered', 'draft')
     returning id`,
    [id],
  );
  if (!row) {
    const [existing] = await sql<{ id: number }>(`select id from purchase_orders where id = $1`, [id]);
    if (!existing) throw new ApiError(404, "Supplier order not found.");
    throw new ApiError(409, "Only an open order or a draft can be cancelled.");
  }
  await writeAudit(sql, user, {
    action: "cancel",
    entity: "order",
    entityId: id,
    summary: `Cancelled supplier order ${id}.`,
  });
}

export async function getDashboard(user: Staff): Promise<DashboardData> {
  const today = kigaliToday();
  const soon = addDays(today, 30);
  const [counts] = await sql<{
    drugs: number;
    units: number;
    low: number;
    expiring: number;
    expired: number;
  }>(
    `select
       count(*)::int as drugs,
       coalesce(sum(quantity), 0)::int as units,
       count(*) filter (where quantity <= reorder_level)::int as low,
       count(*) filter (where expiry_date >= $1 and expiry_date <= $2)::int as expiring,
       count(*) filter (where expiry_date < $1)::int as expired
     from drugs`,
    [today, soon],
  );
  const [openOrders] = await sql<{ orders: number; units: number }>(
    `select count(distinct p.id)::int as orders, coalesce(sum(i.quantity), 0)::int as units
     from purchase_orders p
     join purchase_order_items i on i.order_id = p.id
     where p.status = 'ordered'`,
  );
  const [todaySales] = await sql<{ count: number; total: number }>(
    `select count(*)::int as count, coalesce(sum(total), 0)::int as total
     from sales
     where (created_at at time zone 'Africa/Kigali')::date = $1::date`,
    [today],
  );
  const [recentRx] = await sql<{ recent: number; pending: number }>(
    `select
       count(*) filter (
         where (created_at at time zone 'Africa/Kigali')::date >= ($1::date - 6)
       )::int as recent,
       count(*) filter (where status = 'pending')::int as pending
     from prescriptions`,
    [today],
  );
  const attention = await sql<DrugRow>(
    `${drugSelect}
     where d.quantity <= d.reorder_level or d.expiry_date <= $1
     order by (d.expiry_date < $2) desc, (d.quantity <= d.reorder_level) desc, d.expiry_date
     limit 8`,
    [soon, today],
  );
  const recentPrescriptions = await sql(
    `select p.id, p.patient_name, p.status, p.created_at,
            (select count(*)::int from prescription_items i where i.prescription_id = p.id) as item_count
     from prescriptions p
     order by p.created_at desc
     limit 5`,
  );
  const recentSales = await sql(
    `select s.id, d.name as drug_name, d.strength, s.quantity, s.total, s.customer_name,
            s.prescription_id, s.created_at
     from sales s
     join drugs d on d.id = s.drug_id
     where (s.created_at at time zone 'Africa/Kigali')::date = $1::date
     order by s.created_at desc
     limit 6`,
    [today],
  );

  const inventory = can(user.role, "inventory");
  const sales = can(user.role, "sales");
  const prescriptions = can(user.role, "prescriptions");
  const orders = can(user.role, "orders");

  return {
    showInventory: inventory,
    showSales: sales,
    showPrescriptions: prescriptions,
    showOrders: orders,
    totalDrugs: inventory ? num(counts?.drugs) : 0,
    totalUnits: inventory ? num(counts?.units) : 0,
    lowStock: inventory ? num(counts?.low) : 0,
    expiringSoon: inventory ? num(counts?.expiring) : 0,
    expired: inventory ? num(counts?.expired) : 0,
    openOrderCount: orders ? num(openOrders?.orders) : 0,
    openOrderUnits: orders ? num(openOrders?.units) : 0,
    todaySales: sales ? { count: num(todaySales?.count), total: num(todaySales?.total) } : { count: 0, total: 0 },
    recentPrescriptionCount: prescriptions ? num(recentRx?.recent) : 0,
    pendingPrescriptions: prescriptions ? num(recentRx?.pending) : 0,
    attention: inventory
      ? attention.map((row) => {
          const drug = toDrug(row, today);
          return {
            id: drug.id,
            name: drug.name,
            strength: drug.strength,
            quantity: drug.quantity,
            reorderLevel: drug.reorderLevel,
            expiryDate: drug.expiryDate,
            onOrder: orders ? drug.onOrder : 0,
            low: drug.low,
            expired: drug.expired,
            expiringSoon: drug.expiringSoon,
          };
        })
      : [],
    recentPrescriptions: prescriptions
      ? recentPrescriptions.map((row) => ({
          id: num(row.id),
          patientName: text(row.patient_name),
          status: text(row.status) as Prescription["status"],
          createdAt: text(row.created_at),
          itemCount: num(row.item_count),
        }))
      : [],
    recentSales: sales
      ? recentSales.map((row) => ({
          id: num(row.id),
          drugName: text(row.drug_name),
          strength: text(row.strength),
          quantity: num(row.quantity),
          total: num(row.total),
          customerName: text(row.customer_name),
          prescriptionId: row.prescription_id == null ? null : num(row.prescription_id),
          createdAt: text(row.created_at),
        }))
      : [],
  };
}
