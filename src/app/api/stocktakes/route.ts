import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { postStocktake, saveStocktakeLine, startStocktake, stocktakeSheet } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

export async function GET() {
  try {
    await requireUser();
    return json({ stocktake: await stocktakeSheet() });
  } catch (error) {
    return fail(error);
  }
}

const schema = z.object({
  action: z.enum(["start", "count", "post"]),
  note: z.string().trim().max(200).optional().default(""),
  drugId: z.number().int().positive().optional(),
  counted: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(schema, await readJson(request));
    if (body.action === "start") {
      await startStocktake(user, body.note);
      return json({ stocktake: await stocktakeSheet() });
    }
    if (body.action === "count") {
      if (!body.drugId || body.counted == null) return json({ error: "Count a drug." }, 400);
      await saveStocktakeLine(user, body.drugId, body.counted);
      return json({ stocktake: await stocktakeSheet() });
    }
    await postStocktake(user);
    return json({ stocktake: null });
  } catch (error) {
    return fail(error);
  }
}
