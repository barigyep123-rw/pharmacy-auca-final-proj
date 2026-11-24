import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listSales } from "@/lib/pharmacy";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "sales");
    return json({ sales: await listSales() });
  } catch (error) {
    return fail(error);
  }
}
