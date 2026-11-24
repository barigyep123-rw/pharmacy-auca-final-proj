import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { listSiblingBrands } from "@/lib/shop-ops";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    return json({ brands: await listSiblingBrands(takeId(id)) });
  } catch (error) {
    return fail(error);
  }
}
