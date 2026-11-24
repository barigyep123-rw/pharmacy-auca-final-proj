import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { updateSupplier } from "@/lib/suppliers";
import { parseBody, supplierProfileSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "orders");
    const { id } = await context.params;
    const supplier = await updateSupplier(user, takeId(id), parseBody(supplierProfileSchema, await readJson(request)));
    return json({ supplier });
  } catch (error) {
    return fail(error);
  }
}
