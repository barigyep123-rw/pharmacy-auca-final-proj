import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { removePaymentMethod, updatePaymentMethod } from "@/lib/settings";
import { parseBody, paymentMethodUpdateSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const method = await updatePaymentMethod(user, takeId(id), parseBody(paymentMethodUpdateSchema, await readJson(request)));
    return json({ method });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await removePaymentMethod(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
