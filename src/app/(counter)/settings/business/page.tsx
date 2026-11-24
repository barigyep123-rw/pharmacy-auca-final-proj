import type { Metadata } from "next";
import { BusinessSettings } from "@/components/business-settings";

export const metadata: Metadata = { title: "Business" };

export default function BusinessSettingsPage() {
  return <BusinessSettings />;
}
