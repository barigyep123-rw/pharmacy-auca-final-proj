import { sql, withTransaction } from "./db";
import { ApiError } from "./errors";
import { hashPassword } from "./password";
import type { Role, Staff } from "./types";

export async function hasAdmin() {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const [row] = await sql<{ n: number }>("select count(*)::int as n from users where role = 'admin'");
  return (row?.n ?? 0) > 0;
}

export async function registerInitialAdmin(input: {
  name: string;
  phone: string;
  email: string;
  password: string;
}): Promise<Staff> {
  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (query) => {
    await query("select pg_advisory_xact_lock(8841201)");
    const [existing] = await query<{ n: number }>("select count(*)::int as n from users where role = 'admin'");
    if ((existing?.n ?? 0) > 0) {
      throw new ApiError(409, "An admin is already registered. Sign in instead.");
    }
    const [user] = await query<{ id: number; name: string; email: string; role: Role }>(
      `insert into users (name, email, phone, password_hash, role)
       values ($1, $2, $3, $4, 'admin')
       returning id, name, email, role`,
      [input.name, input.email.toLowerCase(), input.phone, passwordHash],
    );
    if (!user) throw new ApiError(500, "The admin account was not created.");
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
}
