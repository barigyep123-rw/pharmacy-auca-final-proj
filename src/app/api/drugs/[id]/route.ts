import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { deleteDrug, getDrug, updateDrug } from "@/lib/pharmacy";
import { drugUpdateSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    return json(await getDrug(takeId(id)));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "inventory");
    const { id } = await context.params;
    const drug = await updateDrug(user, takeId(id), parseBody(drugUpdateSchema, await readJson(request)));
    return json({ drug });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "deleteDrug");
    const { id } = await context.params;
    await deleteDrug(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
