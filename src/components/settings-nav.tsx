"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/settings/staff", label: "Staff" },
  { href: "/settings/payments", label: "Payments" },
  { href: "/settings/business", label: "Business" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/insurance", label: "Insurance" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Settings">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            role="tab"
            aria-selected={active}
            className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-pine text-paper-2" : "bg-card text-muted"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
