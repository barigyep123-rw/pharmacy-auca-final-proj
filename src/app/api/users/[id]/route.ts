import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { removeUser, setUserActive } from "@/lib/users";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };

const activeSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = parseBody(activeSchema, await readJson(request));
    return json({ user: await setUserActive(user, takeId(id), body.active) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await removeUser(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
