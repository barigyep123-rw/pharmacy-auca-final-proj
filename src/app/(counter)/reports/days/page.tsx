import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { DayReport } from "@/components/day-report";
import { addDays, kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Sales by day" };

export default function DayReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Grouping the days…</p>}>
      <DayBody />
    </Suspense>
  );
}

async function DayBody() {
  await connection();
  const today = kigaliToday();
  return <DayReport initialFrom={addDays(today, -29)} initialTo={today} />;
}
