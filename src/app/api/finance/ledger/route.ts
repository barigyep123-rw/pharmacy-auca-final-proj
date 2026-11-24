import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ledger } from "@/lib/finance";
import { fail, json } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    return json(await ledger());
  } catch (error) {
    return fail(error);
  }
}
