import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { resolveStaffPasswords } from "../src/lib/staff-secrets";

const originalAdmin = process.env.UBUZIMA_ADMIN_PASSWORD;
const originalPharmacist = process.env.UBUZIMA_PHARMACIST_PASSWORD;

afterEach(() => {
  restore("UBUZIMA_ADMIN_PASSWORD", originalAdmin);
  restore("UBUZIMA_PHARMACIST_PASSWORD", originalPharmacist);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function clearEnv() {
  delete process.env.UBUZIMA_ADMIN_PASSWORD;
  delete process.env.UBUZIMA_PHARMACIST_PASSWORD;
}

test("hosted startup does not invent staff passwords", async () => {
  clearEnv();
  const passwords = await resolveStaffPasswords({ hosted: true, memory: false, directory: "/tmp/does-not-matter" });
  assert.equal(passwords, null);
});

test("environment passwords are used as given and are not replaced", async () => {
  const admin = randomBytes(18).toString("base64url");
  const pharmacist = randomBytes(18).toString("base64url");
  process.env.UBUZIMA_ADMIN_PASSWORD = admin;
  process.env.UBUZIMA_PHARMACIST_PASSWORD = pharmacist;
  const passwords = await resolveStaffPasswords({ hosted: true, memory: false });
  assert.deepEqual(passwords, { admin, pharmacist });
});

test("a local file is created only outside hosted mode", async () => {
  clearEnv();
  const directory = await mkdtemp(path.join(tmpdir(), "ubuzima-staff-"));
  try {
    const first = await resolveStaffPasswords({ hosted: false, memory: false, directory });
    const second = await resolveStaffPasswords({ hosted: false, memory: false, directory });
    assert.ok(first);
    assert.deepEqual(second, first);
    assert.notEqual(first.admin, first.pharmacist);
    const stored = await readFile(path.join(directory, "staff-passwords.txt"), "utf8");
    assert.match(stored, new RegExp(first.admin));
    assert.equal(first.admin.length >= 24, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
