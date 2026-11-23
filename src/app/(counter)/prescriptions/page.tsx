import type { Metadata } from "next";
import { PrescriptionsScreen } from "@/components/prescriptions-screen";

export const metadata: Metadata = { title: "Prescriptions" };

export default function PrescriptionsPage() {
  return <PrescriptionsScreen />;
}
