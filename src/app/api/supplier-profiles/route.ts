import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createSupplierProfile, listSupplierProfiles } from "@/lib/suppliers";
import { parseBody, supplierProfileSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "suppliers");
    return json({ suppliers: await listSupplierProfiles() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "orders");
    const supplier = await createSupplierProfile(user, parseBody(supplierProfileSchema, await readJson(request)));
    return json({ supplier }, 201);
  } catch (error) {
    return fail(error);
  }
}
