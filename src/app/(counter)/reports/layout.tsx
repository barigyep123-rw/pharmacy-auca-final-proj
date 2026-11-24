import { connection } from "next/server";
import { SectionNav } from "@/components/section-nav";
import { guard } from "@/lib/guard";

export const instant = false;

const links = [
  { href: "/reports/daily", label: "Daily" },
  { href: "/reports/drugs", label: "By drug" },
  { href: "/reports/days", label: "By day" },
];

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await guard("reports");
  return (
    <div>
      <SectionNav label="Reports" links={links} />
      {children}
    </div>
  );
}
