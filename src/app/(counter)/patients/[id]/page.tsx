import type { Metadata } from "next";
import { connection } from "next/server";
import { PatientHistoryScreen } from "@/components/patient-history";
import { guard } from "@/lib/guard";

export const metadata: Metadata = { title: "Patient history" };
export const instant = false;

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await guard("patients");
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId) || patientId < 1) {
    return <p className="text-sm text-muted">That patient address is not valid.</p>;
  }
  return <PatientHistoryScreen id={patientId} />;
}
