import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { recordBasket } from "@/lib/pharmacy";
import { basketSchema, parseBody } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(basketSchema, await readJson(request));
    const basket = await recordBasket(user, body);
    return json({ basket }, 201);
  } catch (error) {
    return fail(error);
  }
}
