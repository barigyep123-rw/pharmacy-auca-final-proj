import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { InvoicesScreen } from "@/components/invoices-screen";
import { kigaliToday } from "@/lib/time";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Opening invoices…</p>}>
      <InvoicesBody />
    </Suspense>
  );
}

async function InvoicesBody() {
  await connection();
  return <InvoicesScreen today={kigaliToday()} />;
}
