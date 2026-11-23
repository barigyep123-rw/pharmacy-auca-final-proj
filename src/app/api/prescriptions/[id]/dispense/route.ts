import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { dispensePrescription } from "@/lib/pharmacy";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "prescriptions");
    await readJson(request);
    const { id } = await context.params;
    await dispensePrescription(user, takeId(id));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
