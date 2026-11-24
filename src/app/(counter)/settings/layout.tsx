import { connection } from "next/server";
import { SettingsNav } from "@/components/settings-nav";
import { guard } from "@/lib/guard";

export const instant = false;

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await guard("settings");
  return (
    <div>
      <SettingsNav />
      {children}
    </div>
  );
}
