import type { Metadata } from "next";
import { connection } from "next/server";
import { DraftOrdersScreen } from "@/components/draft-orders-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Draft orders" };
export const instant = false;

export default async function DraftOrdersPage() {
  await connection();
  await guard("drafts");
  return <DraftOrdersScreen />;
}
