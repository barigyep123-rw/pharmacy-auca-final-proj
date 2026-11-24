import { assertAccess } from "./access";
import { sql } from "./db";
import type { QueryFn } from "./query";
import type { Staff } from "./types";

export async function writeAudit(
  query: QueryFn,
  actor: { id: number; name: string },
  entry: { action: string; entity: string; entityId?: number | null; summary: string },
) {
  await query(
    `insert into audit_log (actor_id, actor_name, action, entity, entity_id, summary)
     values ($1, $2, $3, $4, $5, $6)`,
    [actor.id, actor.name, entry.action, entry.entity, entry.entityId ?? null, entry.summary],
  );
}

export type AuditEntry = {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: number | null;
  summary: string;
  createdAt: string;
};

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function listAudit(actor: Staff, entity = ""): Promise<AuditEntry[]> {
  assertAccess(actor.role, "audit");
  const rows = await sql(
    `select id, actor_name, action, entity, entity_id, summary, created_at
     from audit_log
     where ($1 = '' or entity = $1)
     order by created_at desc, id desc
     limit 200`,
    [entity],
  );
  return rows.map((row) => ({
    id: num(row.id),
    actorName: text(row.actor_name),
    action: text(row.action),
    entity: text(row.entity),
    entityId: row.entity_id == null ? null : num(row.entity_id),
    summary: text(row.summary),
    createdAt: text(row.created_at),
  }));
}
