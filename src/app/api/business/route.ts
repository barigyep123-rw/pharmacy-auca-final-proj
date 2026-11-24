import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { fail, json, readJson } from "@/lib/http";
import { getBusinessProfile, updateBusinessProfile } from "@/lib/settings";
import { businessSchema, parseBody } from "@/lib/validators";

export async function GET() {
  try {
    await requireUser();
    return json({ profile: await getBusinessProfile() });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(businessSchema, await readJson(request));
    if (!body.receiptPrefix) throw new ApiError(400, "Enter a receipt prefix.");
    const profile = await updateBusinessProfile(user, {
      ...body,
      receiptPrefix: body.receiptPrefix,
      receiptNext: 0,
    });
    return json({ profile });
  } catch (error) {
    return fail(error);
  }
}
