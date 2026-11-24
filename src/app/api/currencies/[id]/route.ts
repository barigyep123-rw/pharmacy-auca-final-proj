import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { removeCurrency, updateCurrency } from "@/lib/settings";
import { currencyUpdateSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const currency = await updateCurrency(user, takeId(id), parseBody(currencyUpdateSchema, await readJson(request)));
    return json({ currency });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await removeCurrency(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
