import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listPatients } from "@/lib/patients";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "patients");
    const q = new URL(request.url).searchParams.get("q") ?? "";
    return json({ patients: await listPatients(q) });
  } catch (error) {
    return fail(error);
  }
}
