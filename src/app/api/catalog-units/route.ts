import { can } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/errors";
import { addCatalogUnit, listCatalogUnits, removeCatalogUnit } from "@/lib/units-catalog";
import { fail, json, readJson, takeId } from "@/lib/http";
import { z } from "zod";
import { parseBody } from "@/lib/validators";

const unitSchema = z.object({
  kind: z.enum(["base", "pack"]),
  name: z.string().trim().min(2, "Enter a unit name.").max(24),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!can(user.role, "inventory") && !can(user.role, "settings")) {
      throw new ApiError(403, "You do not have access to that.");
    }
    return json({ units: await listCatalogUnits() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const units = await addCatalogUnit(user, parseBody(unitSchema, await readJson(request)));
    return json({ units }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const units = await removeCatalogUnit(user, takeId(url.searchParams.get("id") ?? ""));
    return json({ units });
  } catch (error) {
    return fail(error);
  }
}
