import { requireUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { listGenericNames } from "@/lib/shop-ops";

export async function GET() {
  try {
    await requireUser();
    return json({ generics: await listGenericNames() });
  } catch (error) {
    return fail(error);
  }
}
