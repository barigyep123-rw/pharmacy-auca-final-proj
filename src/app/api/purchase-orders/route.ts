import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/pharmacy";
import { parseBody, purchaseOrderSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "orders");
    return json({ orders: await listPurchaseOrders() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "orders");
    const order = await createPurchaseOrder(user, parseBody(purchaseOrderSchema, await readJson(request)));
    return json({ order }, 201);
  } catch (error) {
    return fail(error);
  }
}
