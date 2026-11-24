import type { Metadata } from "next";
import { connection } from "next/server";
import { PatientsScreen } from "@/components/patients-screen";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Patients" };
export const instant = false;

export default async function PatientsPage() {
  await connection();
  await guard("patients");
  return <PatientsScreen />;
}
