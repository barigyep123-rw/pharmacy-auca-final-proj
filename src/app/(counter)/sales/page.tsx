import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SalesScreen } from "@/components/sales-screen";
import { guard } from "@/lib/guard";
import { kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Sales" };
export const instant = false;

export default function SalesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Opening the counter…</p>}>
      <SalesBody />
    </Suspense>
  );
}

async function SalesBody() {
  await connection();
  await guard("sales");
  return <SalesScreen today={kigaliToday()} />;
}
