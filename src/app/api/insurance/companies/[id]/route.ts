import { requireUser } from "@/lib/auth";
import { assertAccess } from "@/lib/access";
import { fail, json, readJson, takeId } from "@/lib/http";
import { saveCompany } from "@/lib/insurance";
import { insurerSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "settings");
    const { id } = await context.params;
    const company = await saveCompany(user, { ...parseBody(insurerSchema, await readJson(request)), id: takeId(id) });
    return json({ company });
  } catch (error) {
    return fail(error);
  }
}
