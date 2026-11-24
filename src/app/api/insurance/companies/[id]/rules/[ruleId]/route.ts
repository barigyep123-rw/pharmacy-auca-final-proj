import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { removeRule } from "@/lib/insurance";

type Context = { params: Promise<{ id: string; ruleId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id, ruleId } = await context.params;
    return json({ rules: await removeRule(user, takeId(id), takeId(ruleId)) });
  } catch (error) {
    return fail(error);
  }
}
