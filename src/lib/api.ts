export class ClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/register") {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    if (typeof window !== "undefined") {
      window.location.replace(new URL("/login", window.location.origin).href);
    }
    throw new ClientError(401, data.error ?? "Sign in to continue.");
  }
  if (!response.ok) {
    throw new ClientError(response.status, data.error ?? "The request did not go through.");
  }
  return data;
}
