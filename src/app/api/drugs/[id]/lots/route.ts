import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { listLots } from "@/lib/lots";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    return json({ lots: await listLots(takeId(id)) });
  } catch (error) {
    return fail(error);
  }
}
