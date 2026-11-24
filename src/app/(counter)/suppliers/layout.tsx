import { connection } from "next/server";
import { SectionNav } from "@/components/section-nav";
import { can } from "@/lib/access";
import { guard } from "@/lib/guard";

export const instant = false;

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const user = await guard("suppliers");
  const links = [
    { href: "/suppliers", label: "Profiles" },
    ...(can(user.role, "orders") ? [{ href: "/suppliers/orders", label: "Supplier orders" }] : []),
  ];
  return (
    <div>
      <SectionNav label="Suppliers" links={links} />
      {children}
    </div>
  );
}
