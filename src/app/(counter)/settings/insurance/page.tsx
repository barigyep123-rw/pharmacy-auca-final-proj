import type { Metadata } from "next";
import { InsuranceSettings } from "@/components/insurance-settings";

export const metadata: Metadata = { title: "Insurance" };

export default function InsurancePage() {
  return <InsuranceSettings />;
}
