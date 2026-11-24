import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createCategory, listCategoryTree } from "@/lib/shop-ops";
import { parseBody } from "@/lib/validators";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).optional().default(""),
});

export async function GET() {
  try {
    await requireUser();
    return json({ categories: await listCategoryTree() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = parseBody(schema, await readJson(request));
    const id = await createCategory(user, body);
    return json({ id }, 201);
  } catch (error) {
    return fail(error);
  }
}
