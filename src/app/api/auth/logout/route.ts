import { logout } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await readJson(request);
    await logout();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
