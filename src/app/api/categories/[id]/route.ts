import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { deleteCategory, updateCategory } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).optional().default(""),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await updateCategory(user, takeId(id), parseBody(schema, await readJson(request)));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await deleteCategory(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
