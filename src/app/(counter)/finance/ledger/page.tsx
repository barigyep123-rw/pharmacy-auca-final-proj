import type { Metadata } from "next";
import { LedgerScreen } from "@/components/ledger-screen";

export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage() {
  return <LedgerScreen />;
}
