import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { closeTill, currentTill, openTill } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

export async function GET() {
  try {
    await requireUser();
    return json({ shift: await currentTill() });
  } catch (error) {
    return fail(error);
  }
}

const schema = z.object({
  action: z.enum(["open", "close"]),
  countedCash: z.number().int().min(0).optional(),
  note: z.string().trim().max(200).optional().default(""),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(schema, await readJson(request));
    if (body.action === "open") return json({ shift: await openTill(user) });
    return json(await closeTill(user, body.countedCash ?? 0, body.note));
  } catch (error) {
    return fail(error);
  }
}
