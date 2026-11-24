import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings-screen";

export const metadata: Metadata = { title: "Staff" };

export default function StaffSettingsPage() {
  return <SettingsScreen />;
}
