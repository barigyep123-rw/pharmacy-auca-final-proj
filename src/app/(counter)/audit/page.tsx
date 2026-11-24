import type { Metadata } from "next";
import { connection } from "next/server";
import { AuditScreen } from "@/components/audit-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Audit log" };
export const instant = false;

export default async function AuditPage() {
  await connection();
  await guard("audit");
  return <AuditScreen />;
}
