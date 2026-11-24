"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SectionNav({
  label,
  links,
}: {
  label: string;
  links: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label={label}>
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
