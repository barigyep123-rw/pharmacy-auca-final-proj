import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { deleteSubcategory } from "@/lib/shop-ops";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await deleteSubcategory(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
