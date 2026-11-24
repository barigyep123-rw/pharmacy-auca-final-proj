import type { Metadata } from "next";
import { PaymentsSettings } from "@/components/payments-settings";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsSettingsPage() {
  return <PaymentsSettings />;
}
