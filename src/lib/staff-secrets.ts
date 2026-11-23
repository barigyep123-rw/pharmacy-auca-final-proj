import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StaffPasswords = {
  admin: string;
  pharmacist: string;
};

function fromEnv(): StaffPasswords | null {
  const admin = process.env.UBUZIMA_ADMIN_PASSWORD?.trim() ?? "";
  const pharmacist = process.env.UBUZIMA_PHARMACIST_PASSWORD?.trim() ?? "";
  if (admin === "" || pharmacist === "") return null;
  return { admin, pharmacist };
}

function generated(): StaffPasswords {
  return {
    admin: randomBytes(24).toString("base64url"),
    pharmacist: randomBytes(24).toString("base64url"),
  };
}

function parse(text: string): StaffPasswords | null {
  let admin = "";
  let pharmacist = "";
  for (const line of text.split("\n")) {
    const [role, , password] = line.trim().split(/\s+/);
    if (role === "admin" && password) admin = password;
    if (role === "pharmacist" && password) pharmacist = password;
  }
  if (admin === "" || pharmacist === "") return null;
  return { admin, pharmacist };
}

async function localFile(directory: string): Promise<StaffPasswords> {
  const file = path.join(directory, "staff-passwords.txt");
  try {
    const existing = parse(await readFile(file, "utf8"));
    if (existing) return existing;
  } catch {
    // First local boot has no password file yet.
  }
  const created = generated();
  await mkdir(directory, { recursive: true });
  const body = [
    "Local staff passwords for Pharmacie Ubuzima.",
    "This file is ignored by git and is not read when the app uses hosted Postgres.",
    `admin amina@ubuzima.rw ${created.admin}`,
    `pharmacist jean@ubuzima.rw ${created.pharmacist}`,
    "",
  ].join("\n");
  await writeFile(file, body, { mode: 0o600 });
  return created;
}

export async function resolveStaffPasswords(options: {
  hosted: boolean;
  memory: boolean;
  directory?: string;
}): Promise<StaffPasswords | null> {
  const configured = fromEnv();
  if (configured) return configured;
  if (options.hosted) return null;
  if (options.memory) return generated();
  return localFile(options.directory ?? path.join(process.cwd(), "data"));
}
