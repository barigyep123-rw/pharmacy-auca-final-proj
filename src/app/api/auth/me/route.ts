import { currentUser } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ error: "Sign in to continue." }, 401);
  return json({ user });
}
