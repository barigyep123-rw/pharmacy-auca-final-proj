import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { listDrafts, updateDraft } from "@/lib/reorder";
import { draftUpdateSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "drafts");
    const { id } = await context.params;
    await updateDraft(user, takeId(id), parseBody(draftUpdateSchema, await readJson(request)));
    return json(await listDrafts());
  } catch (error) {
    return fail(error);
  }
}
