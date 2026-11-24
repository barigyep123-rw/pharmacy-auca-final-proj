import { requireUser } from "@/lib/auth";
import { can } from "@/lib/access";
import { ApiError } from "@/lib/errors";
import { fail, json, readJson, takeId } from "@/lib/http";
import { addRule, listRules } from "@/lib/insurance";
import { coverageRuleSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    if (!can(user.role, "settings") && !can(user.role, "sales")) {
      throw new ApiError(403, "You do not have access to that.");
    }
    const { id } = await context.params;
    return json({ rules: await listRules(takeId(id)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const rules = await addRule(user, takeId(id), parseBody(coverageRuleSchema, await readJson(request)));
    return json({ rules }, 201);
  } catch (error) {
    return fail(error);
  }
}
