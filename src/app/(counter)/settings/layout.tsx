import { SettingsNav } from "@/components/settings-nav";
import { guard } from "@/lib/guard";

export const instant = false;

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await guard("settings");
  return (
    <div>
      <SettingsNav />
      {children}
    </div>
  );
}
