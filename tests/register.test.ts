import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { sql } from "../src/lib/db";
import { ApiError } from "../src/lib/errors";
import { verifyPassword } from "../src/lib/password";
import { hasAdmin, registerInitialAdmin } from "../src/lib/register";
import { seedFacts } from "../src/lib/seed";

test("a fresh install has the shelf, no staff, and accepts one admin", async () => {
  assert.equal(await hasAdmin(), false);
  const [drugs] = await sql<{ n: number }>("select count(*)::int as n from drugs");
  const [users] = await sql<{ n: number }>("select count(*)::int as n from users");
  assert.equal(drugs.n, seedFacts.drugCount);
  assert.equal(users.n, 0);

  const password = randomBytes(12).toString("base64url");
  const created = await registerInitialAdmin({
    name: "Aline Mukamana",
    phone: "0788123456",
    email: "Aline@Ubuzima.rw",
    password,
  });
  assert.equal(created.role, "admin");
  assert.equal(created.email, "aline@ubuzima.rw");
  assert.equal(await hasAdmin(), true);

  const [row] = await sql<{ phone: string; password_hash: string }>(
    "select phone, password_hash from users where email = $1",
    [created.email],
  );
  assert.equal(row.phone, "0788123456");
  assert.equal(await verifyPassword(password, row.password_hash), true);

  await assert.rejects(
    () =>
      registerInitialAdmin({
        name: "Second Person",
        phone: "0788000000",
        email: "second@ubuzima.rw",
        password,
      }),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});
