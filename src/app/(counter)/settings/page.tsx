import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Settings" };
export const instant = false;

export default async function SettingsPage() {
  await guard("settings");
  return <SettingsScreen />;
}
