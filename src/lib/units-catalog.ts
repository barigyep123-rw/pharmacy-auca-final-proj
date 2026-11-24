import { assertAccess } from "./access";
import { writeAudit } from "./audit";
import { sql } from "./db";
import { ApiError, isUniqueViolation } from "./errors";
import type { Staff } from "./types";

export type CatalogUnit = { id: number; kind: "base" | "pack"; name: string };

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

export async function listCatalogUnits(): Promise<CatalogUnit[]> {
  const rows = await sql<{ id: number; kind: string; name: string }>(
    `select id, kind, name from catalog_units where active order by kind, name`,
  );
  return rows.map((row) => ({
    id: num(row.id),
    kind: text(row.kind) === "pack" ? "pack" : "base",
    name: text(row.name),
  }));
}

export async function addCatalogUnit(actor: Staff, input: { kind: "base" | "pack"; name: string }) {
  assertAccess(actor.role, "settings");
  const name = input.name.trim().toLowerCase();
  if (name.length < 2) throw new ApiError(400, "Enter a unit name.");
  try {
    const [row] = await sql<{ id: number }>(
      `insert into catalog_units (kind, name) values ($1, $2) returning id`,
      [input.kind, name],
    );
    await writeAudit(sql, actor, {
      action: "create",
      entity: "catalog_unit",
      entityId: num(row.id),
      summary: `Added ${input.kind} unit ${name}.`,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ApiError(409, "That unit is already on the list.");
    throw error;
  }
  return listCatalogUnits();
}

export async function removeCatalogUnit(actor: Staff, id: number) {
  assertAccess(actor.role, "settings");
  const [row] = await sql<{ id: number; name: string }>(
    `update catalog_units set active = false where id = $1 and active returning id, name`,
    [id],
  );
  if (!row) throw new ApiError(404, "That unit is not on the list.");
  await writeAudit(sql, actor, {
    action: "delete",
    entity: "catalog_unit",
    entityId: id,
    summary: `Removed unit ${text(row.name)}.`,
  });
  return listCatalogUnits();
}
