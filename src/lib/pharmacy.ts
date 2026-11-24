import { assertAccess, can } from "./access";
import { postSettledSale } from "./finance";
import { decodePhoto, photoBytes } from "./photo";
import { stampSale } from "./settings";
import { sql, withTransaction } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { QueryFn } from "./query";
import { addDays, kigaliToday } from "./time";
import type {
  DashboardData,
  Drug,
  Movement,
  PaymentReceipt,
  Prescription,
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
  form: string;
  strength: string;
  sku: string;
  unit_price: number;
  quantity: number;
  reorder_level: number;
  expiry_date: string;
  batch_number: string;
  supplier: string;
  on_order: number | null;
  has_photo?: boolean;
};

const drugSelect = `
  select
    d.id, d.name, d.generic_name, d.category, d.form, d.strength, d.sku,
    d.unit_price, d.quantity, d.reorder_level, d.expiry_date, d.batch_number, d.supplier,
    (d.photo is not null) as has_photo,
    coalesce(o.on_order, 0)::int as on_order
  from drugs d
  left join (
    select i.drug_id, sum(i.quantity)::int as on_order
    from purchase_order_items i
    join purchase_orders p on p.id = i.order_id
    where p.status = 'ordered'
    group by i.drug_id
  ) o on o.drug_id = d.id
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
    form: text(row.form),
    strength: text(row.strength),
    sku: text(row.sku),
    unitPrice: num(row.unit_price),
    quantity,
    reorderLevel,
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
            reorder_level, expiry_date, batch_number, supplier, 0 as on_order
     from drugs where id = $1 for update`,
    [id],
  );
  if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
  return row;
}

function assertSellable(row: DrugRow, quantity: number) {
  const today = kigaliToday();
  const expiry = text(row.expiry_date).slice(0, 10);
  if (expiry < today) {
    throw new ApiError(409, `${text(row.name)} expired on ${expiry} and cannot leave the shelf.`);
  }
  if (num(row.quantity) < quantity) {
    throw new ApiError(409, `Only ${num(row.quantity)} ${text(row.name)} on hand.`);
  }
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
     where ($1 = '' or d.name ilike $2 or d.generic_name ilike $2 or d.sku ilike $2 or d.category ilike $2)
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

export async function createDrug(user: Staff, input: DrugInput): Promise<Drug> {
  assertAccess(user.role, "inventory");
  const photo = storedPhoto(input.photo);
  try {
    const [row] = await sql<{ id: number }>(
      `insert into drugs (
        name, generic_name, category, form, strength, sku, unit_price, quantity,
        reorder_level, expiry_date, batch_number, supplier, photo, photo_type
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      returning id`,
      [
        input.name,
        input.genericName,
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
      ],
    );
    return (await getDrug(row.id)).drug;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That SKU is already in the catalog.");
    throw error;
  }
}

export async function updateDrug(user: Staff, id: number, input: DrugUpdateInput): Promise<Drug> {
  assertAccess(user.role, "inventory");
  try {
    const [row] = await sql<{ id: number }>(
      `update drugs set
        name = $1, generic_name = $2, category = $3, form = $4, strength = $5, sku = $6,
        unit_price = $7, reorder_level = $8, expiry_date = $9, batch_number = $10,
        supplier = $11, updated_at = now()
       where id = $12
       returning id`,
      [
        input.name,
        input.genericName,
        input.category,
        input.form,
        input.strength,
        input.sku,
        input.unitPrice,
        input.reorderLevel,
        input.expiryDate,
        input.batchNumber,
        input.supplier,
        id,
      ],
    );
    if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
    if (input.photo !== undefined) {
      const photo = storedPhoto(input.photo);
      await sql(`update drugs set photo = $1, photo_type = $2 where id = $3`, [photo.bytes, photo.type, id]);
    }
    return (await getDrug(id)).drug;
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
  const [row] = await sql<{ id: number }>(`delete from drugs where id = $1 returning id`, [id]);
  if (!row) throw new ApiError(404, "That drug is no longer in the catalog.");
}

export async function listSales(): Promise<Sale[]> {
  const rows = await sql(
    `select s.id, s.drug_id, d.name as drug_name, d.strength, s.quantity, s.unit_price, s.total,
            s.customer_name, u.name as seller_name, s.prescription_id, s.created_at,
            s.receipt_number, coalesce(m.name, '') as payment_method_name,
            coalesce(m.settles_immediately, true) as settles_immediately
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
  }));
}

export async function recordSale(user: Staff, input: SaleInput) {
  assertAccess(user.role, "sales");
  return withTransaction(async (query) => {
    const drug = await lockDrug(query, input.drugId);
    assertSellable(drug, input.quantity);
    await query(`update drugs set quantity = quantity - $1, updated_at = now() where id = $2`, [
      input.quantity,
      input.drugId,
    ]);
    const priced = await stampSale(query, {
      unitPrice: num(drug.unit_price),
      quantity: input.quantity,
      paymentMethodId: input.paymentMethodId,
    });
    const [sale] = await query<{ id: number; created_at: unknown }>(
      `insert into sales (
         drug_id, quantity, unit_price, total, customer_name, sold_by,
         payment_method_id, currency_id, receipt_number
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, created_at`,
      [
        input.drugId,
        input.quantity,
        num(drug.unit_price),
        priced.total,
        input.customerName,
        user.id,
        priced.paymentMethodId,
        priced.currencyId,
        priced.receiptNumber,
      ],
    );
    await postSettledSale(query, {
      saleId: num(sale.id),
      total: priced.total,
      paymentMethodId: priced.paymentMethodId,
      settlesImmediately: priced.settlesImmediately,
      userId: user.id,
    });
    const receipt: PaymentReceipt = {
      numbers: [priced.receiptNumber],
      issuedAt: text(sale.created_at),
      customerName: input.customerName,
      sellerName: user.name,
      paymentMethodName: priced.paymentMethodName,
      settlesImmediately: priced.settlesImmediately,
      lines: [
        {
          name: text(drug.name),
          strength: text(drug.strength),
          quantity: input.quantity,
          unitPrice: num(drug.unit_price),
          total: priced.total,
        },
      ],
    };
    return {
      id: num(sale.id),
      total: priced.total,
      quantityLeft: num(drug.quantity) - input.quantity,
      receipt,
    };
  });
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

function mapPrescription(
  row: Record<string, unknown>,
  items: PrescriptionItem[],
): Prescription {
  return {
    id: num(row.id),
    patientName: text(row.patient_name),
    patientPhone: text(row.patient_phone),
    doctorName: text(row.doctor_name),
    notes: text(row.notes),
    status: text(row.status) as Prescription["status"],
    createdByName: text(row.created_by_name),
    dispensedByName: row.dispensed_by_name == null ? null : text(row.dispensed_by_name),
    dispensedAt: row.dispensed_at == null ? null : text(row.dispensed_at),
    createdAt: text(row.created_at),
    items,
  };
}

export async function listPrescriptions(): Promise<Prescription[]> {
  const rows = await sql(
    `select p.*, creator.name as created_by_name, dispenser.name as dispensed_by_name
     from prescriptions p
     join users creator on creator.id = p.created_by
     left join users dispenser on dispenser.id = p.dispensed_by
     order by p.created_at desc
     limit 100`,
  );
  const items = await prescriptionItems(rows.map((row) => num(row.id)));
  return rows.map((row) => mapPrescription(row, items.get(num(row.id)) ?? []));
}

export async function createPrescription(user: Staff, input: PrescriptionInput): Promise<Prescription> {
  assertAccess(user.role, "prescriptions");
  assertUniqueDrugs(input.items.map((item) => item.drugId));
  const id = await withTransaction(async (query) => {
    const [header] = await query<{ id: number }>(
      `insert into prescriptions (patient_name, patient_phone, doctor_name, notes, status, created_by)
       values ($1, $2, $3, $4, 'pending', $5)
       returning id`,
      [input.patientName, input.patientPhone, input.doctorName, input.notes, user.id],
    );
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

export async function dispensePrescription(user: Staff, id: number, paymentMethodId?: number): Promise<PaymentReceipt> {
  assertAccess(user.role, "prescriptions");
  return withTransaction(async (query) => {
    const [prescription] = await query<{ id: number; status: string; patient_name: string }>(
      `select id, status, patient_name from prescriptions where id = $1 for update`,
      [id],
    );
    if (!prescription) throw new ApiError(404, "Prescription not found.");
    if (prescription.status !== "pending") {
      throw new ApiError(409, "Only a pending prescription can be dispensed.");
    }
    const items = await query<{ drug_id: number; quantity: number; unit_price: number }>(
      `select drug_id, quantity, unit_price from prescription_items where prescription_id = $1 order by drug_id`,
      [id],
    );
    if (items.length === 0) throw new ApiError(409, "This prescription has no drugs.");
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
      assertSellable(drug, num(item.quantity));
      await query(`update drugs set quantity = quantity - $1, updated_at = now() where id = $2`, [
        num(item.quantity),
        num(item.drug_id),
      ]);
      const priced = await stampSale(query, {
        unitPrice: num(item.unit_price),
        quantity: num(item.quantity),
        paymentMethodId,
      });
      const [sale] = await query<{ id: number; created_at: unknown }>(
        `insert into sales (
           drug_id, quantity, unit_price, total, customer_name, sold_by, prescription_id,
           payment_method_id, currency_id, receipt_number
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, created_at`,
        [
          num(item.drug_id),
          num(item.quantity),
          num(item.unit_price),
          priced.total,
          text(prescription.patient_name),
          user.id,
          id,
          priced.paymentMethodId,
          priced.currencyId,
          priced.receiptNumber,
        ],
      );
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
      });
    }
    await query(
      `update prescriptions set status = 'dispensed', dispensed_by = $1, dispensed_at = now() where id = $2`,
      [user.id, id],
    );
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
    const [order] = await query<{ id: number }>(
      `insert into purchase_orders (supplier_name, status, notes, ordered_by)
       values ($1, 'ordered', $2, $3)
       returning id`,
      [input.supplierName, input.notes, user.id],
    );
    for (const item of input.items) {
      await query(
        `insert into purchase_order_items (order_id, drug_id, quantity, unit_cost, expiry_date, batch_number)
         values ($1, $2, $3, $4, nullif($5, ''), $6)`,
        [order.id, item.drugId, item.quantity, item.unitCost, item.expiryDate, item.batchNumber],
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
      await query(
        `update drugs set
          quantity = quantity + $1,
          expiry_date = case when $2 <> '' then $2 else expiry_date end,
          batch_number = case when $3 <> '' then $3 else batch_number end,
          supplier = $4,
          updated_at = now()
         where id = $5`,
        [
          num(item.quantity),
          item.expiry_date ? text(item.expiry_date).slice(0, 10) : "",
          text(item.batch_number),
          text(order.supplier_name),
          num(item.drug_id),
        ],
      );
    }
    await query(
      `update purchase_orders set status = 'received', received_by = $1, received_at = now() where id = $2`,
      [user.id, id],
    );
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
    const [row] = await sql<{ name: string }>(
      `insert into suppliers (name) values ($1) returning name`,
      [cleaned],
    );
    return { name: text(row.name), created: true };
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
     where id = $1 and status = 'ordered'
     returning id`,
    [id],
  );
  if (!row) {
    const [existing] = await sql<{ id: number }>(`select id from purchase_orders where id = $1`, [id]);
    if (!existing) throw new ApiError(404, "Supplier order not found.");
    throw new ApiError(409, "Only an open supplier order can be cancelled.");
  }
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
