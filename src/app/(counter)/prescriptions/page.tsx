import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PrescriptionsScreen } from "@/components/prescriptions-screen";
import { guard } from "@/lib/guard";
import { kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Prescriptions" };
export const instant = false;

export default function PrescriptionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Opening prescriptions…</p>}>
      <PrescriptionsBody />
    </Suspense>
  );
}

async function PrescriptionsBody() {
  await connection();
  await guard("prescriptions");
  return <PrescriptionsScreen today={kigaliToday()} />;
}
