import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { listClaims, setClaimStatus } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  status: z.enum(["draft", "sent", "part", "paid", "late"]),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = parseBody(schema, await readJson(request));
    await setClaimStatus(user, takeId(id), body.status);
    return json({ claims: await listClaims() });
  } catch (error) {
    return fail(error);
  }
}
