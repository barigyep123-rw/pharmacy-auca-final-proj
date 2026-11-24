import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { saveReadyNote } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  patientId: z.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(24).optional().default(""),
  body: z.string().trim().min(2).max(320),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(schema, await readJson(request));
    const id = await saveReadyNote(user, { patientId: body.patientId ?? null, phone: body.phone, body: body.body });
    return json({ id, message: body.body }, 201);
  } catch (error) {
    return fail(error);
  }
}
