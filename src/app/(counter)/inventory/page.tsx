import type { Metadata } from "next";
import { InventoryScreen } from "@/components/inventory-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Inventory" };
export const instant = false;

export default async function InventoryPage() {
  await guard("inventory");
  return <InventoryScreen />;
}
