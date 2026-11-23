import { ApiError } from "./errors";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ApiError(403, "Cross-origin request refused.");
    }
    if (!host || originHost !== host) {
      throw new ApiError(403, "Cross-origin request refused.");
    }
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Send a JSON body.");
  }
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "The request body is not valid JSON.");
  }
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.message }, error.status);
  }
  console.error(error);
  return json({ error: "Something went wrong." }, 500);
}

export function takeId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "Unknown record.");
  return id;
}
