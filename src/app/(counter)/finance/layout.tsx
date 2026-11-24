import { connection } from "next/server";
import { SectionNav } from "@/components/section-nav";
import { guard } from "@/lib/guard";

export const instant = false;

const links = [
  { href: "/finance/ledger", label: "Ledger" },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/collections", label: "Collections" },
];

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await guard("finance");
  return (
    <div>
      <SectionNav label="Finance" links={links} />
      {children}
    </div>
  );
}
