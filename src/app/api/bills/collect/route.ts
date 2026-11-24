import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { collectAgainstSales } from "@/lib/finance";
import { fail, json, readJson } from "@/lib/http";
import { billCollectSchema, parseBody } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!can(user.role, "sales") && !can(user.role, "finance")) {
      throw new ApiError(403, "You do not have access to that.");
    }
    const result = await collectAgainstSales(user, parseBody(billCollectSchema, await readJson(request)));
    return json(result, 201);
  } catch (error) {
    return fail(error);
  }
}
