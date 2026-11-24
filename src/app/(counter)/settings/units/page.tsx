import type { Metadata } from "next";
import { UnitsSettings } from "@/components/units-settings";

export const metadata: Metadata = { title: "Units" };

export default function UnitsPage() {
  return <UnitsSettings />;
}
