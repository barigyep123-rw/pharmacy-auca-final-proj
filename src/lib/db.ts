import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import type { QueryFn } from "./query";
import { insertSeed, seedCatalog } from "./seed";

const MIGRATIONS = path.join(process.cwd(), "migrations");

type DbStore = {
  pool?: pg.Pool;
  local?: PGlite;
  ready?: Promise<void>;
};

const globalStore = globalThis as typeof globalThis & { __ubuzimaDb?: DbStore };

function db() {
  globalStore.__ubuzimaDb ??= {};
  return globalStore.__ubuzimaDb;
}

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

function memoryMode() {
  return process.env.UBUZIMA_PGLITE === "memory";
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await initDb();
  if (databaseUrl() !== "") {
    const pool = (db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 }));
    const result = await pool.query(text, params);
    return result.rows as T[];
  }
  const result = await db().local!.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  await initDb();
  if (databaseUrl() !== "") {
    const pool = (db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 }));
    const client = await pool.connect();
    const query: QueryFn = async (text, params = []) => {
      const result = await client.query(text, params);
      return result.rows as never;
    };
    try {
      await client.query("begin");
      const value = await fn(query);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  return db().local!.transaction(async (tx) => {
    const query: QueryFn = async (text, params = []) => {
      const result = await tx.query(text, params);
      return result.rows as never;
    };
    return fn(query);
  });
}

let migrationTask: Promise<void> | null = null;

async function ensureMigrations() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!migrationTask) {
    const run = databaseUrl() !== "" ? applyRemoteMigrations() : db().local ? applyLocalMigrations() : Promise.resolve();
    migrationTask = run.finally(() => {
      migrationTask = null;
    });
  }
  await migrationTask;
}

export async function initDb() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!db().ready) {
    db().ready = start().catch((error: unknown) => {
      db().ready = undefined;
      throw error;
    });
  }
  await db().ready;
  // A long-lived dev process keeps the database open. New migration files still
  // have to land, or the next request queries columns that are not there yet.
  await ensureMigrations();
}

async function applyRemoteMigrations() {
  const pool = (db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 }));
  const client = await pool.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    const doneRows = await client.query<{ name: string }>("select name from schema_migrations");
    const done = new Set(doneRows.rows.map((row) => row.name));
    const files = (await readdir(MIGRATIONS).catch(() => [])).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const script = await readFile(path.join(MIGRATIONS, file), "utf8");
      await client.query("begin");
      try {
        await client.query(script);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function start() {
  if (databaseUrl() !== "") {
    db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    await applyRemoteMigrations();
    await seedIfEmpty(true);
    return;
  }

  const dataDir = path.join(process.cwd(), "data", "pglite");
  if (!memoryMode()) await mkdir(path.dirname(dataDir), { recursive: true });
  const local = memoryMode() ? new PGlite() : new PGlite(dataDir);
  db().local = local;
  await local.waitReady;
  await applyLocalMigrations();
  await seedIfEmpty(false);
}

async function applyLocalMigrations() {
  await db().local!.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const files = (await readdir(MIGRATIONS).catch(() => [])).filter((file) => file.endsWith(".sql")).sort();
  const doneRows = await db().local!.query<{ name: string }>("select name from schema_migrations");
  const done = new Set(doneRows.rows.map((row) => row.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const script = await readFile(path.join(MIGRATIONS, file), "utf8");
    await db().local!.transaction(async (tx) => {
      await tx.exec(script);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
  }
}

async function seedIfEmpty(pooled: boolean) {
  if (pooled) {
    const client = await db().pool!.connect();
    const clientQuery: QueryFn = async (text, params = []) => {
      const result = await client.query(text, params);
      return result.rows as never;
    };
    try {
      await client.query("begin");
      await seedCatalog(clientQuery);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await db().local!.transaction(async (tx) => {
    const txQuery: QueryFn = async (text, params = []) => {
      const result = await tx.query(text, params);
      return result.rows as never;
    };
    await seedCatalog(txQuery);
  });
}

export async function resetAndSeed() {
  await initDb();
  await sql(
    `truncate table
      reorder_scans,
      audit_log,
      ledger_entries,
      collections,
      supplier_invoices,
      sales,
      prescription_fills,
      prescription_items,
      prescriptions,
      patients,
      purchase_order_items,
      purchase_orders,
      sessions,
      drugs,
      suppliers,
      users
    restart identity cascade`,
  );
  const passwords = {
    admin: randomBytes(18).toString("base64url"),
    pharmacist: randomBytes(18).toString("base64url"),
    stock_keeper: randomBytes(18).toString("base64url"),
    cashier: randomBytes(18).toString("base64url"),
    dispenser: randomBytes(18).toString("base64url"),
  };
  await withTransaction(async (query) => {
    await insertSeed(query, passwords);
  });
}
