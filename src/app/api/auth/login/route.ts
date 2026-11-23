import { login } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { loginSchema, parseBody } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = parseBody(loginSchema, await readJson(request));
    const user = await login(body.email, body.password);
    return json({ user });
  } catch (error) {
    return fail(error);
  }
}
