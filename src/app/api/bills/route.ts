import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { creditAccounts, listBills } from "@/lib/pharmacy";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "sales");
    const bills = await listBills();
    return json({ bills, accounts: creditAccounts(bills) });
  } catch (error) {
    return fail(error);
  }
}
