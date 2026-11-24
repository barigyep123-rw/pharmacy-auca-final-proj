import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { dailyReport } from "@/lib/reports";
import { kigaliToday } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "reports");
    const date = new URL(request.url).searchParams.get("date") || kigaliToday();
    return json(await dailyReport(date));
  } catch (error) {
    return fail(error);
  }
}
