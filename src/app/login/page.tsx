import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { currentUser } from "@/lib/auth";
import { hasAdmin } from "@/lib/register";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ready?: string }>;
}) {
  await connection();
  if (await currentUser()) redirect("/dashboard");
  if (!(await hasAdmin())) redirect("/register");
  const params = await searchParams;
  return (
    <LoginScreen
      notice={
        params.ready === "1" ? "Account created. Sign in with the email and password you just chose." : null
      }
    />
  );
}
