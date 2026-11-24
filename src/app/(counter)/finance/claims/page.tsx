import type { Metadata } from "next";
import { ClaimsScreen } from "@/components/claims-screen";

export const metadata: Metadata = { title: "Claims" };

export default function ClaimsPage() {
  return <ClaimsScreen />;
}
