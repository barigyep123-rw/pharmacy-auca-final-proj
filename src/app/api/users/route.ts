import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { createUser, listUsers } from "@/lib/users";
import { parseBody, staffSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    return json({ users: await listUsers(user) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const created = await createUser(user, parseBody(staffSchema, await readJson(request)));
    return json({ user: created }, 201);
  } catch (error) {
    return fail(error);
  }
}
