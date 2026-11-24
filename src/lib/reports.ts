import { sql } from "./db";
import { ApiError } from "./errors";

const day = /^\d{4}-\d{2}-\d{2}$/;

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function takeDay(value: string, label: string) {
  if (!day.test(value)) throw new ApiError(400, `${label} needs a real date.`);
  return value;
}

const kigaliDay = `(s.created_at at time zone 'Africa/Kigali')::date`;

export type ReportSale = {
  id: number;
  receiptNumber: string;
  drugName: string;
  strength: string;
  quantity: number;
  total: number;
  customerName: string;
  tenderName: string;
  createdAt: string;
};

export async function dailyReport(date: string) {
  const dayValue = takeDay(date, "The report date");
  const rows = await sql(
    `select s.id, s.receipt_number, d.name as drug_name, d.strength, s.quantity, s.total,
            s.customer_name, coalesce(m.name, 'Cash') as tender_name,
            coalesce(m.settles_immediately, true) as settles_immediately, s.created_at
     from sales s
     join drugs d on d.id = s.drug_id
     left join payment_methods m on m.id = s.payment_method_id
     where ${kigaliDay} = $1::date
     order by s.created_at desc`,
    [dayValue],
  );
  const sales: ReportSale[] = rows.map((row) => ({
    id: num(row.id),
    receiptNumber: text(row.receipt_number),
    drugName: text(row.drug_name),
    strength: text(row.strength),
    quantity: num(row.quantity),
    total: num(row.total),
    customerName: text(row.customer_name),
    tenderName: text(row.tender_name),
    createdAt: text(row.created_at),
  }));
  const tenderMap = new Map<string, { name: string; total: number; count: number }>();
  let settled = 0;
  let onAccount = 0;
  for (const row of rows) {
    const name = text(row.tender_name);
    const current = tenderMap.get(name) ?? { name, total: 0, count: 0 };
    current.total += num(row.total);
    current.count += 1;
    tenderMap.set(name, current);
    if (row.settles_immediately === false) onAccount += num(row.total);
    else settled += num(row.total);
  }
  return {
    date: dayValue,
    count: sales.length,
    total: sales.reduce((sum, sale) => sum + sale.total, 0),
    settled,
    onAccount,
    tenders: [...tenderMap.values()].sort((a, b) => b.total - a.total),
    sales,
  };
}

export async function salesByDrug(from: string, to: string) {
  const start = takeDay(from, "The start date");
  const end = takeDay(to, "The end date");
  if (start > end) throw new ApiError(400, "The start date has to be on or before the end date.");
  const rows = await sql(
    `select d.id, d.name, d.strength, coalesce(sum(s.quantity), 0)::int as quantity, coalesce(sum(s.total), 0)::int as total
     from sales s
     join drugs d on d.id = s.drug_id
     where ${kigaliDay} between $1::date and $2::date
     group by d.id, d.name, d.strength
     order by total desc, d.name`,
    [start, end],
  );
  const drugs = rows.map((row) => ({
    id: num(row.id),
    name: text(row.name),
    strength: text(row.strength),
    quantity: num(row.quantity),
    total: num(row.total),
  }));
  return {
    from: start,
    to: end,
    quantity: drugs.reduce((sum, drug) => sum + drug.quantity, 0),
    total: drugs.reduce((sum, drug) => sum + drug.total, 0),
    drugs,
  };
}

export async function salesByDay(from: string, to: string) {
  const start = takeDay(from, "The start date");
  const end = takeDay(to, "The end date");
  if (start > end) throw new ApiError(400, "The start date has to be on or before the end date.");
  const rows = await sql(
    `select ${kigaliDay} as day,
            count(*)::int as count,
            coalesce(sum(s.total), 0)::int as total,
            coalesce(sum(s.total) filter (where coalesce(m.settles_immediately, true)), 0)::int as settled,
            coalesce(sum(s.total) filter (where m.settles_immediately = false), 0)::int as on_account
     from sales s
     left join payment_methods m on m.id = s.payment_method_id
     where ${kigaliDay} between $1::date and $2::date
     group by 1
     order by 1 desc`,
    [start, end],
  );
  const days = rows.map((row) => ({
    date: text(row.day).slice(0, 10),
    count: num(row.count),
    total: num(row.total),
    settled: num(row.settled),
    onAccount: num(row.on_account),
  }));
  return {
    from: start,
    to: end,
    count: days.reduce((sum, dayRow) => sum + dayRow.count, 0),
    total: days.reduce((sum, dayRow) => sum + dayRow.total, 0),
    days,
  };
}
