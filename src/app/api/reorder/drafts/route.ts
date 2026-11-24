import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listDrafts } from "@/lib/reorder";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "drafts");
    return json(await listDrafts());
  } catch (error) {
    return fail(error);
  }
}
