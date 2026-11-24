import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { salesByDrug } from "@/lib/reports";
import { addDays, kigaliToday } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "reports");
    const url = new URL(request.url);
    const today = kigaliToday();
    const from = url.searchParams.get("from") || addDays(today, -29);
    const to = url.searchParams.get("to") || today;
    return json(await salesByDrug(from, to));
  } catch (error) {
    return fail(error);
  }
}
