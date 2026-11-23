import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createSupplier, listSupplierNames } from "@/lib/pharmacy";
import { parseBody, supplierSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "inventory");
    return json({ suppliers: await listSupplierNames() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "orders");
    const body = parseBody(supplierSchema, await readJson(request));
    const saved = await createSupplier(user, body.name);
    return json({ supplier: { name: saved.name } }, saved.created ? 201 : 200);
  } catch (error) {
    return fail(error);
  }
}
