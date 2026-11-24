import type { Metadata } from "next";
import { connection } from "next/server";
import { SuppliersScreen } from "@/components/suppliers-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Suppliers" };
export const instant = false;

export default async function SuppliersPage() {
  await connection();
  await guard("suppliers");
  return <SuppliersScreen />;
}
