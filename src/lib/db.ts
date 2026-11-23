import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import type { QueryFn } from "./query";
import { insertSeed } from "./seed";

const MIGRATIONS = path.join(process.cwd(), "migrations");

let pool: pg.Pool | undefined;
let local: PGlite | undefined;
let ready: Promise<void> | undefined;

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() ?? "";
}

function memoryMode() {
  return process.env.APOTHEKA_PGLITE === "memory";
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await initDb();
  if (databaseUrl() !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    const result = await pool.query(text, params);
    return result.rows as T[];
  }
  const result = await local!.query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T> {
  await initDb();
  if (databaseUrl() !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
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

  return local!.transaction(async (tx) => {
    const query: QueryFn = async (text, params = []) => {
      const result = await tx.query(text, params);
      return result.rows as never;
    };
    return fn(query);
  });
}

export async function initDb() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (ready) return ready;
  ready = start().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

async function start() {
  if (databaseUrl() !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 5 });
    await seedIfEmpty(async (text, params = []) => {
      const result = await pool!.query(text, params);
      return result.rows as never;
    }, true);
    return;
  }

  const dataDir = path.join(process.cwd(), "data", "pglite");
  if (!memoryMode()) await mkdir(path.dirname(dataDir), { recursive: true });
  local = memoryMode() ? new PGlite() : new PGlite(dataDir);
  await local.waitReady;
  await applyLocalMigrations();
  await seedIfEmpty(async (text, params = []) => {
    const result = await local!.query(text, params);
    return result.rows as never;
  }, false);
}

async function applyLocalMigrations() {
  await local!.exec(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const files = (await readdir(MIGRATIONS).catch(() => [])).filter((file) => file.endsWith(".sql")).sort();
  const doneRows = await local!.query<{ name: string }>("select name from schema_migrations");
  const done = new Set(doneRows.rows.map((row) => row.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const script = await readFile(path.join(MIGRATIONS, file), "utf8");
    await local!.transaction(async (tx) => {
      await tx.exec(script);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
  }
}

async function seedIfEmpty(query: QueryFn, pooled: boolean) {
  if (pooled) {
    const client = await pool!.connect();
    const clientQuery: QueryFn = async (text, params = []) => {
      const result = await client.query(text, params);
      return result.rows as never;
    };
    try {
      await client.query("begin");
      const [row] = await clientQuery<{ n: number }>("select count(*)::int as n from users");
      if ((row?.n ?? 0) === 0) await insertSeed(clientQuery);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const [row] = await query<{ n: number }>("select count(*)::int as n from users");
  if ((row?.n ?? 0) > 0) return;
  await local!.transaction(async (tx) => {
    const txQuery: QueryFn = async (text, params = []) => {
      const result = await tx.query(text, params);
      return result.rows as never;
    };
    await insertSeed(txQuery);
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
  await withTransaction(async (query) => {
    await insertSeed(query);
  });
}
