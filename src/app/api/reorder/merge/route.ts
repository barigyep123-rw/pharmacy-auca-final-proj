import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { listDrafts, mergeDrafts } from "@/lib/reorder";
import { mergeDraftsSchema, parseBody } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "drafts");
    const body = parseBody(mergeDraftsSchema, await readJson(request));
    const merged = await mergeDrafts(user, body.ids, body.supplierName);
    return json({ ...merged, ...(await listDrafts()) });
  } catch (error) {
    return fail(error);
  }
}
