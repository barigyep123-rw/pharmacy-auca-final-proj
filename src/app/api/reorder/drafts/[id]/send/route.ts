import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { listDrafts, sendDraft } from "@/lib/reorder";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "drafts");
    const { id } = await context.params;
    await sendDraft(user, takeId(id));
    return json(await listDrafts());
  } catch (error) {
    return fail(error);
  }
}
