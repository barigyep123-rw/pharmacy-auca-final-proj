import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { InventoryScreen } from "@/components/inventory-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Inventory" };
export const instant = false;

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Reading the shelves…</p>}>
      <InventoryBody />
    </Suspense>
  );
}

async function InventoryBody() {
  await connection();
  await guard("inventory");
  return <InventoryScreen />;
}
