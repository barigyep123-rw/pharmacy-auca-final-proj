import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { payInvoice } from "@/lib/finance";
import { fail, json, takeId } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    const { id } = await context.params;
    await payInvoice(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
