import type { Metadata } from "next";
import { PrescriptionsScreen } from "@/components/prescriptions-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Prescriptions" };
export const instant = false;

export default async function PrescriptionsPage() {
  await guard("prescriptions");
  return <PrescriptionsScreen />;
}
