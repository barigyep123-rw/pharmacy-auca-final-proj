import { Suspense } from "react";
import { SessionGate } from "@/components/session-gate";

export const instant = false;

export default function CounterLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="px-4 py-16 text-sm">Opening the ledger…</div>}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}
