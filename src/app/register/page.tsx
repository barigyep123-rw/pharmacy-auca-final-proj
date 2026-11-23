import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { RegisterScreen } from "@/components/register-screen";
import { currentUser } from "@/lib/auth";
import { hasAdmin } from "@/lib/register";

export const metadata: Metadata = { title: "Register" };
export const instant = false;

export default async function RegisterPage() {
  await connection();
  if (await currentUser()) redirect("/dashboard");
  if (await hasAdmin()) redirect("/login");
  return <RegisterScreen />;
}
