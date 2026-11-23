import { fail, json, readJson } from "@/lib/http";
import { registerInitialAdmin } from "@/lib/register";
import { parseBody, registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = parseBody(registerSchema, await readJson(request));
    const user = await registerInitialAdmin(body);
    return json({ user }, 201);
  } catch (error) {
    return fail(error);
  }
}
