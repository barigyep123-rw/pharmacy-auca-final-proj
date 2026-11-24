import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { recordAdjustment } from "@/lib/lots";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  drugId: z.number().int().positive(),
  kind: z.enum(["return_restock", "return_dispose", "damaged", "expired"]),
  quantity: z.number().int().min(1).max(100_000),
  reason: z.string().trim().min(2).max(200),
  lotNumber: z.string().trim().max(40).optional(),
  expiryDate: z.string().optional(),
  batchId: z.number().int().positive().optional(),
  saleId: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "inventory");
    const id = await recordAdjustment(user, parseBody(schema, await readJson(request)));
    return json({ id }, 201);
  } catch (error) {
    return fail(error);
  }
}
