import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listDrafts, scanReorderDrafts } from "@/lib/reorder";

export async function POST() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "drafts");
    const result = await scanReorderDrafts(user);
    const board = await listDrafts();
    return json({ ...result, ...board });
  } catch (error) {
    return fail(error);
  }
}
