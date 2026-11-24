import { assertAccess } from "./access";
import { sql, withTransaction } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { QueryFn } from "./query";
import type { Staff } from "./types";

export type Currency = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  isDefault: boolean;
  active: boolean;
};

export type PaymentKind = "cash" | "mobile_money" | "card" | "credit" | "custom";

export type PaymentMethod = {
  id: number;
  code: string;
  name: string;
  kind: PaymentKind;
  settlesImmediately: boolean;
  active: boolean;
  sortOrder: number;
};

export type BusinessProfile = {
  name: string;
  phone: string;
  email: string;
  address: string;
  receiptPrefix: string;
  receiptNext: number;
  receiptPadding: number;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  defaultDiscountBps: number;
  allowLineDiscount: boolean;
  defaultReorderLevel: number;
};

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(row: {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_default: boolean;
  active: boolean;
}): Currency {
  return {
    id: num(row.id),
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    isDefault: row.is_default,
    active: row.active,
  };
}

function method(row: {
  id: number;
  code: string;
  name: string;
  kind: PaymentKind;
  settles_immediately: boolean;
  active: boolean;
  sort_order: number;
}): PaymentMethod {
  return {
    id: num(row.id),
    code: row.code,
    name: row.name,
    kind: row.kind,
    settlesImmediately: row.settles_immediately,
    active: row.active,
    sortOrder: num(row.sort_order),
  };
}

export function settlesFor(kind: PaymentKind, requested: boolean) {
  if (kind === "custom") return requested;
  if (kind === "credit") return false;
  return true;
}

export async function listCurrencies(): Promise<Currency[]> {
  const rows = await sql<{
    id: number;
    code: string;
    name: string;
    symbol: string;
    is_default: boolean;
    active: boolean;
  }>(`select id, code, name, symbol, is_default, active from currencies order by is_default desc, code`);
  return rows.map(currency);
}

export async function createCurrency(
  actor: Staff,
  input: { code: string; name: string; symbol: string; isDefault: boolean },
): Promise<Currency> {
  assertAccess(actor.role, "settings");
  try {
    return await withTransaction(async (query) => {
      if (input.isDefault) await query(`update currencies set is_default = false where is_default`);
      const [row] = await query<{
        id: number;
        code: string;
        name: string;
        symbol: string;
        is_default: boolean;
        active: boolean;
      }>(
        `insert into currencies (code, name, symbol, is_default, active)
         values ($1, $2, $3, $4, true)
         returning id, code, name, symbol, is_default, active`,
        [input.code, input.name, input.symbol, input.isDefault],
      );
      return currency(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That currency code is already in use.");
    throw error;
  }
}

export async function updateCurrency(
  actor: Staff,
  id: number,
  input: { name: string; symbol: string; isDefault: boolean; active: boolean },
): Promise<Currency> {
  assertAccess(actor.role, "settings");
  return withTransaction(async (query) => {
    const [current] = await query<{ is_default: boolean }>(`select is_default from currencies where id = $1 for update`, [id]);
    if (!current) throw new ApiError(404, "That currency is not on the list.");
    if (current.is_default && !input.isDefault) {
      throw new ApiError(409, "Choose another default before retiring this one.");
    }
    if (current.is_default && !input.active) {
      throw new ApiError(409, "The default currency has to stay available.");
    }
    if (input.isDefault) {
      await query(`update currencies set is_default = false where is_default and id <> $1`, [id]);
    }
    const [row] = await query<{
      id: number;
      code: string;
      name: string;
      symbol: string;
      is_default: boolean;
      active: boolean;
    }>(
      `update currencies set name = $1, symbol = $2, is_default = $3, active = $4
       where id = $5
       returning id, code, name, symbol, is_default, active`,
      [input.name, input.symbol, input.isDefault, input.isDefault ? true : input.active, id],
    );
    return currency(row);
  });
}

export async function removeCurrency(actor: Staff, id: number) {
  assertAccess(actor.role, "settings");
  const [current] = await sql<{ is_default: boolean }>(`select is_default from currencies where id = $1`, [id]);
  if (!current) throw new ApiError(404, "That currency is not on the list.");
  if (current.is_default) throw new ApiError(409, "Choose another default before removing this currency.");
  const [used] = await sql<{ n: number }>(`select count(*)::int as n from sales where currency_id = $1`, [id]);
  if ((used?.n ?? 0) > 0) throw new ApiError(409, "This currency is on a sale. Turn it off instead of removing it.");
  await sql(`delete from currencies where id = $1`, [id]);
}

export async function listPaymentMethods(activeOnly = false): Promise<PaymentMethod[]> {
  const rows = await sql<{
    id: number;
    code: string;
    name: string;
    kind: PaymentKind;
    settles_immediately: boolean;
    active: boolean;
    sort_order: number;
  }>(
    `select id, code, name, kind, settles_immediately, active, sort_order
     from payment_methods
     ${activeOnly ? "where active" : ""}
     order by sort_order, name`,
  );
  return rows.map(method);
}

export async function createPaymentMethod(
  actor: Staff,
  input: { code: string; name: string; kind: PaymentKind; settlesImmediately: boolean },
): Promise<PaymentMethod> {
  assertAccess(actor.role, "settings");
  const settles = settlesFor(input.kind, input.settlesImmediately);
  try {
    const [row] = await sql<{
      id: number;
      code: string;
      name: string;
      kind: PaymentKind;
      settles_immediately: boolean;
      active: boolean;
      sort_order: number;
    }>(
      `insert into payment_methods (code, name, kind, settles_immediately, sort_order)
       values ($1, $2, $3, $4, (select coalesce(max(sort_order), 0) + 1 from payment_methods))
       returning id, code, name, kind, settles_immediately, active, sort_order`,
      [input.code, input.name, input.kind, settles],
    );
    return method(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That payment code is already in use.");
    throw error;
  }
}

export async function updatePaymentMethod(
  actor: Staff,
  id: number,
  input: { name: string; kind: PaymentKind; settlesImmediately: boolean; active: boolean; sortOrder: number },
): Promise<PaymentMethod> {
  assertAccess(actor.role, "settings");
  if (!input.active) {
    const [others] = await sql<{ n: number }>(
      `select count(*)::int as n from payment_methods where active and id <> $1`,
      [id],
    );
    if ((others?.n ?? 0) === 0) throw new ApiError(409, "The counter needs at least one active way to pay.");
  }
  const settles = settlesFor(input.kind, input.settlesImmediately);
  const [row] = await sql<{
    id: number;
    code: string;
    name: string;
    kind: PaymentKind;
    settles_immediately: boolean;
    active: boolean;
    sort_order: number;
  }>(
    `update payment_methods
     set name = $1, kind = $2, settles_immediately = $3, active = $4, sort_order = $5
     where id = $6
     returning id, code, name, kind, settles_immediately, active, sort_order`,
    [input.name, input.kind, settles, input.active, input.sortOrder, id],
  );
  if (!row) throw new ApiError(404, "That payment method is not on the list.");
  return method(row);
}

export async function removePaymentMethod(actor: Staff, id: number) {
  assertAccess(actor.role, "settings");
  const [current] = await sql<{ active: boolean }>(`select active from payment_methods where id = $1`, [id]);
  if (!current) throw new ApiError(404, "That payment method is not on the list.");
  const [used] = await sql<{ n: number }>(`select count(*)::int as n from sales where payment_method_id = $1`, [id]);
  if ((used?.n ?? 0) > 0) throw new ApiError(409, "This method is on a sale. Turn it off instead of removing it.");
  if (current.active) {
    const [others] = await sql<{ n: number }>(
      `select count(*)::int as n from payment_methods where active and id <> $1`,
      [id],
    );
    if ((others?.n ?? 0) === 0) throw new ApiError(409, "The counter needs at least one active way to pay.");
  }
  await sql(`delete from payment_methods where id = $1`, [id]);
}

function profile(row: {
  name: string;
  phone: string;
  email: string;
  address: string;
  receipt_prefix: string;
  receipt_next: number;
  receipt_padding: number;
  tax_rate_bps: number;
  prices_include_tax: boolean;
  default_discount_bps: number;
  allow_line_discount: boolean;
  default_reorder_level: number;
}): BusinessProfile {
  return {
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    receiptPrefix: row.receipt_prefix,
    receiptNext: num(row.receipt_next),
    receiptPadding: num(row.receipt_padding),
    taxRateBps: num(row.tax_rate_bps),
    pricesIncludeTax: row.prices_include_tax,
    defaultDiscountBps: num(row.default_discount_bps),
    allowLineDiscount: row.allow_line_discount,
    defaultReorderLevel: num(row.default_reorder_level),
  };
}

const profileSelect = `select name, phone, email, address, receipt_prefix, receipt_next, receipt_padding,
  tax_rate_bps, prices_include_tax, default_discount_bps, allow_line_discount, default_reorder_level
  from business_profile where id = 1`;

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const [row] = await sql<Parameters<typeof profile>[0]>(profileSelect);
  if (!row) throw new ApiError(500, "The business profile is missing.");
  return profile(row);
}

export async function updateBusinessProfile(actor: Staff, input: BusinessProfile): Promise<BusinessProfile> {
  assertAccess(actor.role, "settings");
  const [row] = await sql<Parameters<typeof profile>[0]>(
    `update business_profile set
       name = $1, phone = $2, email = $3, address = $4,
       receipt_prefix = $5, receipt_padding = $6,
       tax_rate_bps = $7, prices_include_tax = $8,
       default_discount_bps = $9, allow_line_discount = $10,
       default_reorder_level = $11
     where id = 1
     returning name, phone, email, address, receipt_prefix, receipt_next, receipt_padding,
       tax_rate_bps, prices_include_tax, default_discount_bps, allow_line_discount, default_reorder_level`,
    [
      input.name,
      input.phone,
      input.email,
      input.address,
      input.receiptPrefix,
      input.receiptPadding,
      input.taxRateBps,
      input.pricesIncludeTax,
      input.defaultDiscountBps,
      input.allowLineDiscount,
      input.defaultReorderLevel,
    ],
  );
  return profile(row);
}

export function saleTotal(unitPrice: number, quantity: number, business: Pick<BusinessProfile, "defaultDiscountBps" | "taxRateBps" | "pricesIncludeTax">) {
  const gross = unitPrice * quantity;
  const discount = Math.floor((gross * business.defaultDiscountBps) / 10_000);
  const net = gross - discount;
  const extraTax = business.pricesIncludeTax ? 0 : Math.floor((net * business.taxRateBps) / 10_000);
  return net + extraTax;
}

export async function stampSale(
  query: QueryFn,
  input: { unitPrice: number; quantity: number; paymentMethodId?: number },
) {
  const [business] = await query<Parameters<typeof profile>[0]>(`${profileSelect} for update`);
  if (!business) throw new ApiError(500, "The business profile is missing.");
  const [currencyRow] = await query<{ id: number }>(
    `select id from currencies where is_default and active limit 1`,
  );
  if (!currencyRow) throw new ApiError(409, "Set a default currency before taking payment.");
  const methodId =
    input.paymentMethodId ??
    (
      await query<{ id: number }>(
        `select id from payment_methods where code = 'cash' and active limit 1`,
      )
    )[0]?.id;
  const [chosen] = await query<{ id: number; active: boolean }>(
    `select id, active from payment_methods where id = $1`,
    [methodId],
  );
  if (!chosen || !chosen.active) throw new ApiError(400, "Choose an active payment method.");
  const current = profile(business);
  const receiptNumber = `${current.receiptPrefix}-${String(current.receiptNext).padStart(current.receiptPadding, "0")}`;
  await query(`update business_profile set receipt_next = receipt_next + 1 where id = 1`);
  return {
    total: saleTotal(input.unitPrice, input.quantity, current),
    paymentMethodId: num(chosen.id),
    currencyId: num(currencyRow.id),
    receiptNumber,
  };
}
