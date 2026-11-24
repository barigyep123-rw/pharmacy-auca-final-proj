import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { DailyReport } from "@/components/daily-report";
import { kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Daily sales" };

export default function DailyReportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Adding up the day…</p>}>
      <DailyBody />
    </Suspense>
  );
}

async function DailyBody() {
  await connection();
  return <DailyReport initialDate={kigaliToday()} />;
}
