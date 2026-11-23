import { redirect } from "next/navigation";
import { can, type Area } from "./access";
import { requireUser } from "./auth";

export async function guard(area: Area) {
  const user = await requireUser();
  if (!can(user.role, area)) redirect("/dashboard");
  return user;
}
