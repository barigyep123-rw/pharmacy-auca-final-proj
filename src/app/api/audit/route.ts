import { assertAccess } from "@/lib/access";
import { listAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "audit");
    const entity = new URL(request.url).searchParams.get("entity") ?? "";
    return json({ entries: await listAudit(user, entity) });
  } catch (error) {
    return fail(error);
  }
}
