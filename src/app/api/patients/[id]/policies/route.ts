import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { addPolicy, listPolicies } from "@/lib/insurance";
import { parseBody, policySchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    return json({ policies: await listPolicies(takeId(id)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const policies = await addPolicy(user, takeId(id), parseBody(policySchema, await readJson(request)));
    return json({ policies }, 201);
  } catch (error) {
    return fail(error);
  }
}
