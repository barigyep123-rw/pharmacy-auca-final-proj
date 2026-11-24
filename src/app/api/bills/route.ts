import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listBills } from "@/lib/pharmacy";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "sales");
    return json({ bills: await listBills() });
  } catch (error) {
    return fail(error);
  }
}
