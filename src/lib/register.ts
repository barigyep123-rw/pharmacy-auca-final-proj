import { randomBytes } from "node:crypto";
import { writeAudit } from "./audit";
import { sql, withTransaction } from "./db";
import { exampleStaff } from "./example-staff";
import { ApiError } from "./errors";
import { hashPassword } from "./password";
import type { Role, Staff } from "./types";

export type DemoLogin = {
  name: string;
  email: string;
  role: Role;
  password: string;
};

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
}): Promise<{ admin: Staff; demoStaff: DemoLogin[] }> {
  const passwordHash = await hashPassword(input.password);
  const demoStaff: DemoLogin[] = [];
  for (const person of exampleStaff) {
    demoStaff.push({ ...person, password: randomBytes(18).toString("base64url") });
  }
  const admin = await withTransaction(async (query) => {
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
    for (const person of demoStaff) {
      const hash = await hashPassword(person.password);
      await query(
        `insert into users (name, email, password_hash, role) values ($1, $2, $3, $4)`,
        [person.name, person.email, hash, person.role],
      );
    }
    await writeAudit(query, user, {
      action: "register",
      entity: "staff",
      entityId: user.id,
      summary: `Registered ${user.name} as the first admin.`,
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  });
  return { admin, demoStaff };
}
