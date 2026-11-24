import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { DrugReport } from "@/components/drug-report";
import { addDays, kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Sales by drug" };

export default function DrugReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Grouping the drugs…</p>}>
      <DrugBody />
    </Suspense>
  );
}

async function DrugBody() {
  await connection();
  const today = kigaliToday();
  return <DrugReport initialFrom={addDays(today, -29)} initialTo={today} />;
}
