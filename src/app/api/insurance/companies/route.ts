import { requireUser } from "@/lib/auth";
import { assertAccess, can } from "@/lib/access";
import { ApiError } from "@/lib/errors";
import { fail, json, readJson } from "@/lib/http";
import { listCompanies, saveCompany } from "@/lib/insurance";
import { insurerSchema, parseBody } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    if (!can(user.role, "settings") && !can(user.role, "patients") && !can(user.role, "sales")) {
      throw new ApiError(403, "You do not have access to that.");
    }
    return json({ companies: await listCompanies() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "settings");
    const company = await saveCompany(user, parseBody(insurerSchema, await readJson(request)));
    return json({ company }, 201);
  } catch (error) {
    return fail(error);
  }
}
