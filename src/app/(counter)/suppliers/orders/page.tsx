import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SupplierOrdersScreen } from "@/components/supplier-orders-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Supplier orders" };
export const instant = false;

export default async function SupplierOrdersPage() {
  await connection();
  await guard("orders");
  return (
    <Suspense fallback={<div className="px-1 py-6 text-sm text-muted">Opening supplier orders…</div>}>
      <SupplierOrdersScreen />
    </Suspense>
  );
}
