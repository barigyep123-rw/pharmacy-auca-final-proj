import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { collectCredit, listOutstanding } from "@/lib/finance";
import { fail, json, readJson } from "@/lib/http";
import { collectionSchema, parseBody } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    return json({ sales: await listOutstanding() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    const result = await collectCredit(user, parseBody(collectionSchema, await readJson(request)));
    return json(result, 201);
  } catch (error) {
    return fail(error);
  }
}
