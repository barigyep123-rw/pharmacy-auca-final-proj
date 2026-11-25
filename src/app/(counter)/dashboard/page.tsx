import type { Metadata } from "next";
import { connection } from "next/server";
import { DashboardScreen } from "@/components/dashboard-screen";
import { guard } from "@/lib/guard";
import { greeting, kigaliLongDate } from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };
export const instant = false;

export default async function DashboardPage() {
  await connection();
  await guard("dashboard");
  return <DashboardScreen title={`${greeting()}.`} lede={kigaliLongDate()} />;
}
