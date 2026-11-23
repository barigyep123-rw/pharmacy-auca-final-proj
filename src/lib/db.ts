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
    db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    const result = await db().pool.query(text, params);
    return result.rows as T[];
  }
  const result = await db().local!.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  await initDb();
  if (databaseUrl() !== "") {
    db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    const client = await db().pool.connect();
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

export async function initDb() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (db().ready) return db().ready;
  db().ready = start().catch((error: unknown) => {
    db().ready = undefined;
    throw error;
  });
  return db().ready;
}

async function start() {
  if (databaseUrl() !== "") {
    db().pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    await seedIfEmpty(true);
    return;
  }

  const dataDir = path.join(process.cwd(), "data", "pglite");
  if (!memoryMode()) await mkdir(path.dirname(dataDir), { recursive: true });
  db().local = memoryMode() ? new PGlite() : new PGlite(dataDir);
  await db().local.waitReady;
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
      sales,
      prescription_items,
      prescriptions,
      purchase_order_items,
      purchase_orders,
      sessions,
      drugs,
      users
    restart identity cascade`,
  );
  const passwords = {
    admin: randomBytes(18).toString("base64url"),
    pharmacist: randomBytes(18).toString("base64url"),
    stock_keeper: randomBytes(18).toString("base64url"),
    cashier: randomBytes(18).toString("base64url"),
  };
  await withTransaction(async (query) => {
    await insertSeed(query, passwords);
  });
}
