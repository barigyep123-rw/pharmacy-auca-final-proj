import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { patientHistory, updatePatientNotes } from "@/lib/patients";
import { parseBody, patientNotesSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "patients");
    const { id } = await context.params;
    return json(await patientHistory(takeId(id)));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "patients");
    const { id } = await context.params;
    const body = parseBody(patientNotesSchema, await readJson(request));
    await updatePatientNotes(user, takeId(id), body.notes);
    return json(await patientHistory(takeId(id)));
  } catch (error) {
    return fail(error);
  }
}
