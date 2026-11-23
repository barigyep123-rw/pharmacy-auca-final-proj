import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { getDashboard } from "@/lib/pharmacy";

export async function GET() {
  try {
    const user = await requireUser();
    return json(await getDashboard(user));
  } catch (error) {
    return fail(error);
  }
}
