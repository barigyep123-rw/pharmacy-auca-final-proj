import type { Metadata } from "next";
import { connection } from "next/server";
import { BillsScreen } from "@/components/bills-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Bills" };
export const instant = false;

export default async function BillsPage() {
  await connection();
  await guard("sales");
  return <BillsScreen />;
}
