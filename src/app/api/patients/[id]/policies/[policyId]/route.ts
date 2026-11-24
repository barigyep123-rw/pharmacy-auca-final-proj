import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { removePolicy } from "@/lib/insurance";

type Context = { params: Promise<{ id: string; policyId: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id, policyId } = await context.params;
    return json({ policies: await removePolicy(user, takeId(id), takeId(policyId)) });
  } catch (error) {
    return fail(error);
  }
}
