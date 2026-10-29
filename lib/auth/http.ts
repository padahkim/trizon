// This PoC has one trusted application origin. Never derive it from request headers.
export const AUTH_ORIGIN = "http://localhost:3000";
export const AUTH_MUTATION_HEADERS = { "Content-Type": "application/json", "X-Trizon-Request": "1" };

export function privateAuthResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

type MutationResult = { ok: true; body: Record<string, unknown> } | { ok: false; response: Response };

export async function readAuthMutation(
  request: Request,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
): Promise<MutationResult> {
  const reject = (status: number) => ({ ok: false as const, response: privateAuthResponse(Response.json({ error: "invalid_request" }, { status })) });
  if (request.method !== method) return reject(405);
  if (request.headers.get("Origin") !== AUTH_ORIGIN || request.headers.get("X-Trizon-Request") !== "1") return reject(403);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reject(415);
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return reject(400);
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return reject(400);
  }
}
