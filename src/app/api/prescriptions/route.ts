import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createPrescription, listPrescriptions } from "@/lib/pharmacy";
import { parseBody, prescriptionSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "prescriptions");
    return json({ prescriptions: await listPrescriptions() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "prescriptions");
    const prescription = await createPrescription(user, parseBody(prescriptionSchema, await readJson(request)));
    return json({ prescription }, 201);
  } catch (error) {
    return fail(error);
  }
}
