import type { Metadata } from "next";
import { SalesScreen } from "@/components/sales-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Sales" };
export const instant = false;

export default async function SalesPage() {
  await guard("sales");
  return <SalesScreen />;
}
