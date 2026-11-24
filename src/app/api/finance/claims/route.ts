import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createClaim, listClaims, listInsurers } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  insurerId: z.number().int().positive(),
  patientId: z.number().int().positive().nullable().optional(),
  saleId: z.number().int().positive().nullable().optional(),
  memberNumber: z.string().trim().max(40).optional().default(""),
  patientPaid: z.number().int().min(0),
  insurerAmount: z.number().int().min(0),
  notes: z.string().trim().max(200).optional().default(""),
});

export async function GET() {
  try {
    await requireUser();
    return json({ claims: await listClaims(), insurers: await listInsurers() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const id = await createClaim(user, parseBody(schema, await readJson(request)));
    return json({ id, claims: await listClaims() }, 201);
  } catch (error) {
    return fail(error);
  }
}
