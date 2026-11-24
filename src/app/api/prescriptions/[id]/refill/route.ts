import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { refillPrescription } from "@/lib/pharmacy";
import { dispenseSchema, parseBody } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "prescriptions");
    const body = parseBody(dispenseSchema, await readJson(request));
    const { id } = await context.params;
    const receipt = await refillPrescription(user, takeId(id), body.paymentMethodId);
    return json({ receipt });
  } catch (error) {
    return fail(error);
  }
}
