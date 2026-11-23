import { connection } from "next/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { hasAdmin } from "@/lib/register";

export const instant = false;

export default async function Home() {
  await connection();
  if (await currentUser()) redirect("/dashboard");
  if (await hasAdmin()) redirect("/login");
  redirect("/register");
}
