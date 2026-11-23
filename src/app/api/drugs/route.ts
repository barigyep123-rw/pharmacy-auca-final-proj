import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createDrug, listDrugs } from "@/lib/pharmacy";
import { drugInputSchema, parseBody } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    return json({ drugs: await listDrugs(url.searchParams.get("q") ?? "", url.searchParams.get("filter") ?? "all") });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "inventory");
    const drug = await createDrug(user, parseBody(drugInputSchema, await readJson(request)));
    return json({ drug }, 201);
  } catch (error) {
    return fail(error);
  }
}
