import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { getDashboard } from "@/lib/pharmacy";

export async function GET() {
  try {
    await requireUser();
    return json(await getDashboard());
  } catch (error) {
    return fail(error);
  }
}
