import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createCurrency, listCurrencies } from "@/lib/settings";
import { currencySchema, parseBody } from "@/lib/validators";

export async function GET() {
  try {
    await requireUser();
    return json({ currencies: await listCurrencies() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const currency = await createCurrency(user, parseBody(currencySchema, await readJson(request)));
    return json({ currency }, 201);
  } catch (error) {
    return fail(error);
  }
}
