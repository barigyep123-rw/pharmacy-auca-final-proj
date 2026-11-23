import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createPrescription, listPrescriptions } from "@/lib/pharmacy";
import { parseBody, prescriptionSchema } from "@/lib/validators";

export async function GET() {
  try {
    await requireUser();
    return json({ prescriptions: await listPrescriptions() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const prescription = await createPrescription(user, parseBody(prescriptionSchema, await readJson(request)));
    return json({ prescription }, 201);
  } catch (error) {
    return fail(error);
  }
}
