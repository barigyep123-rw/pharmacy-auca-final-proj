import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createPaymentMethod, listPaymentMethods } from "@/lib/settings";
import { parseBody, paymentMethodSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    return json({ methods: await listPaymentMethods(url.searchParams.get("active") === "1") });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const method = await createPaymentMethod(user, parseBody(paymentMethodSchema, await readJson(request)));
    return json({ method }, 201);
  } catch (error) {
    return fail(error);
  }
}
