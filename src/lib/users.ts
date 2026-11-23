import { assertAccess } from "./access";
import { sql } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import { hashPassword } from "./password";
import type { Role, Staff } from "./types";

export type StaffAccount = Staff & { active: boolean };

function account(row: { id: number; name: string; email: string; role: Role; active: boolean }): StaffAccount {
  return { id: row.id, name: row.name, email: row.email, role: row.role, active: row.active };
}

export async function listUsers(actor: Staff): Promise<StaffAccount[]> {
  assertAccess(actor.role, "settings");
  const rows = await sql<{ id: number; name: string; email: string; role: Role; active: boolean }>(
    `select id, name, email, role, active from users order by active desc, name`,
  );
  return rows.map(account);
}

export async function createUser(
  actor: Staff,
  input: { name: string; email: string; password: string; role: Role },
): Promise<StaffAccount> {
  assertAccess(actor.role, "settings");
  const passwordHash = await hashPassword(input.password);
  try {
    const [row] = await sql<{ id: number; name: string; email: string; role: Role; active: boolean }>(
      `insert into users (name, email, password_hash, role, active)
       values ($1, $2, $3, $4, true)
       returning id, name, email, role, active`,
      [input.name, input.email.toLowerCase(), passwordHash, input.role],
    );
    if (!row) throw new ApiError(500, "The account was not created.");
    return account(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That email or username is already in use.");
    throw error;
  }
}

async function activeAdmins() {
  const [row] = await sql<{ n: number }>(
    `select count(*)::int as n from users where role = 'admin' and active = true`,
  );
  return row?.n ?? 0;
}

export async function setUserActive(actor: Staff, id: number, active: boolean): Promise<StaffAccount> {
  assertAccess(actor.role, "settings");
  if (actor.id === id && !active) throw new ApiError(409, "You can't turn off your own account.");
  const [current] = await sql<{ role: Role; active: boolean }>(`select role, active from users where id = $1`, [id]);
  if (!current) throw new ApiError(404, "That person is not on the staff list.");
  if (current.role === "admin" && current.active && !active && (await activeAdmins()) <= 1) {
    throw new ApiError(409, "The pharmacy needs at least one active admin.");
  }
  const [row] = await sql<{ id: number; name: string; email: string; role: Role; active: boolean }>(
    `update users set active = $1 where id = $2 returning id, name, email, role, active`,
    [active, id],
  );
  if (!active) await sql(`delete from sessions where user_id = $1`, [id]);
  return account(row);
}

export async function removeUser(actor: Staff, id: number) {
  assertAccess(actor.role, "settings");
  if (actor.id === id) throw new ApiError(409, "You can't remove your own account.");
  const [current] = await sql<{ role: Role; active: boolean }>(`select role, active from users where id = $1`, [id]);
  if (!current) throw new ApiError(404, "That person is not on the staff list.");
  if (current.role === "admin" && current.active && (await activeAdmins()) <= 1) {
    throw new ApiError(409, "The pharmacy needs at least one active admin.");
  }
  const [refs] = await sql<{ n: number }>(
    `select (
      (select count(*) from sales where sold_by = $1) +
      (select count(*) from prescriptions where created_by = $1 or dispensed_by = $1) +
      (select count(*) from purchase_orders where ordered_by = $1 or received_by = $1)
    )::int as n`,
    [id],
  );
  if ((refs?.n ?? 0) > 0) {
    throw new ApiError(409, "This person is on the sales or order record. Turn the account off instead.");
  }
  await sql(`delete from users where id = $1`, [id]);
}
