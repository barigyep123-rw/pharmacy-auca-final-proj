import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listSupplierProfiles } from "@/lib/suppliers";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "suppliers");
    return json({ suppliers: await listSupplierProfiles() });
  } catch (error) {
    return fail(error);
  }
}
