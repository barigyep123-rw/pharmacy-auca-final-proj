"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, FileText, Landmark, LayoutDashboard, LogOut, Menu, Package, ScrollText, Settings, ShoppingBag, Truck, Users, X } from "lucide-react";
import { useState } from "react";
import { can, roleLabel, type Area } from "@/lib/access";
import { pharmacyPlace, pharmacyShort } from "@/lib/brand";
import { api } from "@/lib/api";
import type { Staff } from "@/lib/types";
import { cn } from "@/lib/utils";

const links: Array<{ href: string; label: string; icon: typeof LayoutDashboard; area: Area }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, area: "dashboard" },
  { href: "/inventory", label: "Inventory", icon: Package, area: "inventory" },
  { href: "/sales", label: "Sales", icon: ShoppingBag, area: "sales" },
  { href: "/prescriptions", label: "Prescriptions", icon: ClipboardList, area: "prescriptions" },
  { href: "/patients", label: "Patients", icon: Users, area: "patients" },
  { href: "/suppliers", label: "Suppliers", icon: Truck, area: "suppliers" },
  { href: "/orders/drafts", label: "Draft orders", icon: FileText, area: "drafts" },
  { href: "/finance", label: "Finance", icon: Landmark, area: "finance" },
  { href: "/reports", label: "Reports", icon: BarChart3, area: "reports" },
  { href: "/audit", label: "Audit", icon: ScrollText, area: "audit" },
  { href: "/settings", label: "Settings", icon: Settings, area: "settings" },
];

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M16 7v18M10 13h12" stroke="#fbf9f5" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Shell({ user, children }: { user: Staff; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    window.location.replace(new URL("/login", window.location.origin).href);
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {links.filter((link) => can(user.role, link.area)).map((link) => {
        const active =
          link.href === "/settings" ||
          link.href === "/finance" ||
          link.href === "/reports" ||
          link.href === "/patients" ||
          link.href === "/suppliers" ||
          link.href === "/orders/drafts"
            ? pathname.startsWith(link.href)
            : pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
              active ? "bg-white/12 text-paper-2" : "text-paper-2/75 hover:bg-white/8 hover:text-paper-2",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-full md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col bg-pine-deep text-paper-2 md:flex">
        <div className="flex items-center gap-3 px-5 pt-6">
          <Mark className="size-8 text-brass" />
          <div>
            <p className="font-serif text-xl leading-none">{pharmacyShort}</p>
            <p className="mt-1 text-xs text-paper-2/60">{pharmacyPlace}</p>
          </div>
        </div>
        {nav}
        <div className="border-t border-white/10 p-4 pb-16">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-paper-2/60">{roleLabel(user.role)}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 inline-flex items-center gap-2 text-sm text-paper-2/80 hover:text-paper-2"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col border-t-[3px] border-brass md:border-t-0">
        <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <Mark className="size-7 text-brass" />
            <span className="font-serif text-lg">{pharmacyShort}</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-paper"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>
        {open ? (
          <div className="border-b border-line bg-pine-deep text-paper-2 md:hidden">
            {nav}
            <button
              type="button"
              onClick={() => void signOut()}
              className="mx-3 mb-4 inline-flex items-center gap-2 px-3 text-sm text-paper-2/80"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        ) : null}
        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
