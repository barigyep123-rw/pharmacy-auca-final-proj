import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "./db";
import { ApiError } from "./errors";
import { verifyPassword } from "./password";
import type { Role, Staff } from "./types";

const COOKIE = "apotheka_session";
const MAX_AGE = 60 * 60 * 12;

function staff(row: { id: number; name: string; email: string; role: Role }): Staff {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export async function login(email: string, password: string): Promise<Staff> {
  const [user] = await sql<{
    id: number;
    name: string;
    email: string;
    role: Role;
    password_hash: string;
  }>(`select id, name, email, role, password_hash from users where lower(email) = lower($1)`, [
    email.trim(),
  ]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, "Those details don't match a staff account.");
  }
  const token = randomBytes(32).toString("hex");
  await sql(
    `insert into sessions (token, user_id, expires_at) values ($1, $2, now() + interval '12 hours')`,
    [token, user.id],
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return staff(user);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql(`delete from sessions where token = $1`, [token]);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<Staff | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const [user] = await sql<{ id: number; name: string; email: string; role: Role }>(
    `select u.id, u.name, u.email, u.role
     from sessions s
     join users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now()`,
    [token],
  );
  return user ? staff(user) : null;
}

export async function requireUser(): Promise<Staff> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Sign in to continue.");
  return user;
}
