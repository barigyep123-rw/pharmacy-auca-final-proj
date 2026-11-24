import { assertAccess, can } from "./access";
import { writeAudit } from "./audit";
import { sql, withTransaction } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { QueryFn } from "./query";
import { ensureSupplier } from "./suppliers";
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

export async function postSettledSale(
  query: QueryFn,
  input: { saleId: number; total: number; paymentMethodId: number; settlesImmediately: boolean; userId: number },
) {
  if (!input.settlesImmediately || input.total <= 0) return;
  await query(
    `insert into ledger_entries (kind, direction, amount, payment_method_id, sale_id, created_by)
     values ('sale', 'in', $1, $2, $3, $4)`,
    [input.total, input.paymentMethodId, input.saleId, input.userId],
  );
}

export type TenderTotal = {
  name: string;
  kind: string;
  count: number;
  total: number;
  settled: number;
  onAccount: number;
};

export type LedgerSale = {
  id: number;
  receiptNumber: string;
  drugName: string;
  strength: string;
  quantity: number;
  total: number;
  customerName: string;
  tenderName: string;
  tenderKind: string;
  settlesImmediately: boolean;
  collected: number;
  remaining: number;
  createdAt: string;
};

export async function ledger() {
  const tenderRows = await sql(
    `select coalesce(m.name, 'Cash') as name,
            coalesce(m.kind, 'cash') as kind,
            count(*)::int as count,
            coalesce(sum(s.total), 0)::int as total,
            coalesce(sum(s.total) filter (where coalesce(m.settles_immediately, true)), 0)::int as settled,
            coalesce(sum(s.total) filter (where m.settles_immediately = false), 0)::int as on_account
     from sales s
     left join payment_methods m on m.id = s.payment_method_id
     group by 1, 2
     order by 2, 1`,
  );
  const tenders: TenderTotal[] = tenderRows.map((row) => ({
    name: text(row.name),
    kind: text(row.kind),
    count: num(row.count),
    total: num(row.total),
    settled: num(row.settled),
    onAccount: num(row.on_account),
  }));
  const [money] = await sql<{ money_in: number; money_out: number }>(
    `select coalesce(sum(amount) filter (where direction = 'in'), 0)::int as money_in,
            coalesce(sum(amount) filter (where direction = 'out'), 0)::int as money_out
     from ledger_entries`,
  );
  const sales = await sql(
    `select s.id, s.receipt_number, d.name as drug_name, d.strength, s.quantity, s.total,
            s.customer_name, coalesce(m.name, 'Cash') as tender_name, coalesce(m.kind, 'cash') as tender_kind,
            coalesce(m.settles_immediately, true) as settles_immediately,
            coalesce(c.collected, 0)::int as collected,
            coalesce(cov.covered, 0)::int as covered, s.created_at
     from sales s
     join drugs d on d.id = s.drug_id
     left join payment_methods m on m.id = s.payment_method_id
     left join (
       select sale_id, sum(amount)::int as collected from collections group by sale_id
     ) c on c.sale_id = s.id
     left join (
       select sale_id, sum(insurer_amount)::int as covered from sale_coverages group by sale_id
     ) cov on cov.sale_id = s.id
     order by s.created_at desc
     limit 200`,
  );
  return {
    tenders,
    settledTotal: tenders.reduce((sum, item) => sum + item.settled, 0),
    onAccountTotal: tenders.reduce((sum, item) => sum + item.onAccount, 0),
    moneyIn: num(money?.money_in),
    moneyOut: num(money?.money_out),
    sales: sales.map((row): LedgerSale => {
      const total = num(row.total);
      const collected = num(row.collected);
      const covered = num(row.covered);
      const settles = row.settles_immediately !== false;
      return {
        id: num(row.id),
        receiptNumber: text(row.receipt_number),
        drugName: text(row.drug_name),
        strength: text(row.strength),
        quantity: num(row.quantity),
        total,
        customerName: text(row.customer_name),
        tenderName: text(row.tender_name),
        tenderKind: text(row.tender_kind),
        settlesImmediately: settles,
        collected: settles ? total : collected,
        remaining: settles ? 0 : Math.max(0, total - collected - covered),
        createdAt: text(row.created_at),
      };
    }),
  };
}

export type SupplierInvoice = {
  id: number;
  supplierName: string;
  supplierId: number | null;
  terms: string;
  invoiceNumber: string;
  purchaseOrderId: number | null;
  amount: number;
  status: "open" | "paid";
  issuedOn: string;
  notes: string;
  createdAt: string;
};

export async function listInvoices(): Promise<SupplierInvoice[]> {
  const rows = await sql(
    `select i.id, coalesce(s.name, i.supplier_name) as supplier_name, i.supplier_id, i.invoice_number,
            i.purchase_order_id, i.amount, i.status, i.issued_on, i.notes, i.created_at,
            coalesce(s.terms, '') as terms
     from supplier_invoices i
     left join suppliers s on s.id = i.supplier_id
     order by i.issued_on desc, i.id desc
     limit 100`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    supplierName: text(row.supplier_name),
    supplierId: row.supplier_id == null ? null : num(row.supplier_id),
    terms: text(row.terms),
    invoiceNumber: text(row.invoice_number),
    purchaseOrderId: row.purchase_order_id == null ? null : num(row.purchase_order_id),
    amount: num(row.amount),
    status: text(row.status) === "paid" ? "paid" : "open",
    issuedOn: text(row.issued_on).slice(0, 10),
    notes: text(row.notes),
    createdAt: text(row.created_at),
  }));
}

export async function createInvoice(
  actor: Staff,
  input: {
    supplierId?: number | null;
    supplierName: string;
    invoiceNumber: string;
    amount: number;
    issuedOn: string;
    notes: string;
    purchaseOrderId?: number | null;
  },
) {
  assertAccess(actor.role, "finance");
  try {
    const linked = input.supplierId
      ? (
          await sql<{ id: number; name: string }>(`select id, name from suppliers where id = $1`, [input.supplierId])
        )[0]
      : null;
    if (input.supplierId && !linked) throw new ApiError(400, "Choose a supplier from the list.");
    const supplier = linked
      ? { id: num(linked.id), name: text(linked.name) }
      : await ensureSupplier(sql, input.supplierName);
    const [row] = await sql<{ id: number }>(
      `insert into supplier_invoices (
         supplier_id, supplier_name, invoice_number, purchase_order_id, amount, issued_on, notes, created_by
       ) values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        supplier.id,
        supplier.name,
        input.invoiceNumber,
        input.purchaseOrderId ?? null,
        input.amount,
        input.issuedOn,
        input.notes,
        actor.id,
      ],
    );
    await writeAudit(sql, actor, {
      action: "create",
      entity: "invoice",
      entityId: num(row.id),
      summary: `Recorded invoice ${input.invoiceNumber} for ${supplier.name}.`,
    });
    const invoices = await listInvoices();
    const created = invoices.find((item) => item.id === num(row.id));
    if (!created) throw new ApiError(500, "The invoice was saved but could not be read back.");
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That supplier already has this invoice number.");
    throw error;
  }
}

export async function payInvoice(actor: Staff, id: number) {
  assertAccess(actor.role, "finance");
  return withTransaction(async (query) => {
    const [invoice] = await query<{ id: number; amount: number; status: string; invoice_number: string }>(
      `select id, amount, status, invoice_number from supplier_invoices where id = $1 for update`,
      [id],
    );
    if (!invoice) throw new ApiError(404, "That invoice is not on the list.");
    if (invoice.status === "paid") throw new ApiError(409, "This invoice is already paid.");
    await query(`update supplier_invoices set status = 'paid', paid_at = now() where id = $1`, [id]);
    await query(
      `insert into ledger_entries (kind, direction, amount, supplier_invoice_id, note, created_by)
       values ('supplier_invoice', 'out', $1, $2, $3, $4)`,
      [num(invoice.amount), id, `Supplier invoice ${text(invoice.invoice_number)}`, actor.id],
    );
    await writeAudit(query, actor, {
      action: "pay",
      entity: "invoice",
      entityId: id,
      summary: `Marked invoice ${text(invoice.invoice_number)} paid.`,
    });
  });
}

export type OutstandingSale = {
  id: number;
  receiptNumber: string;
  drugName: string;
  customerName: string;
  total: number;
  collected: number;
  remaining: number;
  createdAt: string;
};

export async function listOutstanding(): Promise<OutstandingSale[]> {
  const rows = await sql(
    `select s.id, s.receipt_number, d.name as drug_name, s.customer_name, s.total,
            coalesce(c.collected, 0)::int as collected,
            coalesce(cov.covered, 0)::int as covered, s.created_at
     from sales s
     join drugs d on d.id = s.drug_id
     join payment_methods m on m.id = s.payment_method_id
     left join (
       select sale_id, sum(amount)::int as collected from collections group by sale_id
     ) c on c.sale_id = s.id
     left join (
       select sale_id, sum(insurer_amount)::int as covered from sale_coverages group by sale_id
     ) cov on cov.sale_id = s.id
     where m.settles_immediately = false
       and s.total > coalesce(c.collected, 0) + coalesce(cov.covered, 0)
     order by s.created_at`,
  );
  return rows.map((row) => {
    const total = num(row.total);
    const collected = num(row.collected);
    const covered = num(row.covered);
    return {
      id: num(row.id),
      receiptNumber: text(row.receipt_number),
      drugName: text(row.drug_name),
      customerName: text(row.customer_name),
      total,
      collected,
      remaining: Math.max(0, total - collected - covered),
      createdAt: text(row.created_at),
    };
  });
}

export async function collectCredit(
  actor: Staff,
  input: { saleId: number; amount: number; paymentMethodId: number },
) {
  assertAccess(actor.role, "finance");
  return withTransaction(async (query) => {
    const [sale] = await query<{ id: number; total: number; settles: boolean }>(
      `select s.id, s.total, m.settles_immediately as settles
       from sales s
       join payment_methods m on m.id = s.payment_method_id
       where s.id = $1
       for update of s`,
      [input.saleId],
    );
    if (!sale) throw new ApiError(404, "That sale is not on the books.");
    if (sale.settles) throw new ApiError(409, "This sale was paid at the counter.");
    const [method] = await query<{ id: number; settles_immediately: boolean; active: boolean }>(
      `select id, settles_immediately, active from payment_methods where id = $1`,
      [input.paymentMethodId],
    );
    if (!method || !method.active || !method.settles_immediately) {
      throw new ApiError(400, "Collect into a method that is paid now, such as cash or mobile money.");
    }
    const [collected] = await query<{ n: number }>(
      `select coalesce(sum(amount), 0)::int as n from collections where sale_id = $1`,
      [input.saleId],
    );
    const remaining = num(sale.total) - num(collected?.n);
    if (input.amount > remaining) throw new ApiError(409, `Only ${remaining} is still outstanding.`);
    await query(
      `insert into collections (sale_id, amount, payment_method_id, collected_by) values ($1, $2, $3, $4)`,
      [input.saleId, input.amount, input.paymentMethodId, actor.id],
    );
    await query(
      `insert into ledger_entries (kind, direction, amount, payment_method_id, sale_id, note, created_by)
       values ('collection', 'in', $1, $2, $3, 'Credit collected', $4)`,
      [input.amount, input.paymentMethodId, input.saleId, actor.id],
    );
    await writeAudit(query, actor, {
      action: "collect",
      entity: "collection",
      entityId: input.saleId,
      summary: `Collected ${input.amount} against sale ${input.saleId}.`,
    });
    return { remaining: remaining - input.amount };
  });
}

export async function collectAgainstSales(
  actor: Staff,
  input: { saleIds: number[]; amount: number; paymentMethodId: number },
) {
  if (!can(actor.role, "finance") && !can(actor.role, "sales")) {
    throw new ApiError(403, "You do not have access to that.");
  }
  return withTransaction(async (query) => {
    const [method] = await query<{ id: number; settles_immediately: boolean; active: boolean }>(
      `select id, settles_immediately, active from payment_methods where id = $1`,
      [input.paymentMethodId],
    );
    if (!method || !method.active || !method.settles_immediately) {
      throw new ApiError(400, "Collect into a method that is paid now, such as cash or mobile money.");
    }
    const sales = await query<{ id: number; total: number; settles: boolean }>(
      `select s.id, s.total, m.settles_immediately as settles
       from sales s
       join payment_methods m on m.id = s.payment_method_id
       where s.id = any($1::int[])
       order by s.id
       for update of s`,
      [input.saleIds],
    );
    if (sales.length === 0) throw new ApiError(404, "That bill is not on the books.");
    let left = input.amount;
    let open = 0;
    for (const sale of sales) {
      if (sale.settles) continue;
      const [collected] = await query<{ n: number }>(
        `select coalesce(sum(amount), 0)::int as n from collections where sale_id = $1`,
        [num(sale.id)],
      );
      const [covered] = await query<{ n: number }>(
        `select coalesce(sum(insurer_amount), 0)::int as n from sale_coverages where sale_id = $1`,
        [num(sale.id)],
      );
      const remaining = num(sale.total) - num(collected?.n) - num(covered?.n);
      open += Math.max(0, remaining);
      const take = Math.min(left, Math.max(0, remaining));
      if (take < 1) continue;
      await query(
        `insert into collections (sale_id, amount, payment_method_id, collected_by) values ($1, $2, $3, $4)`,
        [num(sale.id), take, input.paymentMethodId, actor.id],
      );
      await query(
        `insert into ledger_entries (kind, direction, amount, payment_method_id, sale_id, note, created_by)
         values ('collection', 'in', $1, $2, $3, 'Credit collected', $4)`,
        [take, input.paymentMethodId, num(sale.id), actor.id],
      );
      left -= take;
    }
    if (input.amount > open) throw new ApiError(409, `Only ${open} is still outstanding.`);
    if (left > 0) throw new ApiError(409, `Only ${input.amount - left} could be applied.`);
    await writeAudit(query, actor, {
      action: "collect",
      entity: "collection",
      entityId: num(sales[0]?.id),
      summary: `Collected ${input.amount} against ${sales.length} credit line${sales.length === 1 ? "" : "s"}.`,
    });
    return { remaining: open - input.amount };
  });
}
