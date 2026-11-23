import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { listSales, recordSale } from "@/lib/pharmacy";
import { parseBody, saleSchema } from "@/lib/validators";

export async function GET() {
  try {
    await requireUser();
    return json({ sales: await listSales() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const sale = await recordSale(user, parseBody(saleSchema, await readJson(request)));
    return json({ sale }, 201);
  } catch (error) {
    return fail(error);
  }
}
