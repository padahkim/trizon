import { describe, expect, it } from "vitest";
import { readAuthMutation } from "./http";

function request(headers: Record<string, string> = {}, method = "POST", body = "{}") {
  return new Request("http://localhost:3000/auth/logout", {
    method,
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", "X-Trizon-Request": "1", ...headers },
    ...(method === "GET" ? {} : { body }),
  });
}

describe("cookie-authenticated mutation boundary", () => {
  it("accepts same-origin JSON with the application header", async () => {
    expect(await readAuthMutation(request())).toEqual({ ok: true, body: {} });
  });

  it.each([
    [{ Origin: "https://evil.test" }, "POST", "{}", 403],
    [{ Origin: "null" }, "POST", "{}", 403],
    [{ Origin: "" }, "POST", "{}", 403],
    [{ Origin: "http://localhost:3000/" }, "POST", "{}", 403],
    [{ Origin: "http://127.0.0.1:3000" }, "POST", "{}", 403],
    [{ "Content-Type": "application/x-www-form-urlencoded" }, "POST", "a=b", 415],
    [{ "X-Trizon-Request": "" }, "POST", "{}", 403],
    [{}, "GET", "", 405],
    [{}, "PUT", "{}", 405],
    [{}, "POST", "bad json", 400],
    [{}, "POST", "[]", 400],
  ] as const)("rejects disallowed cookie mutation %#", async (headers, method, body, status) => {
    const result = await readAuthMutation(request(headers, method, body));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected rejection");
    expect(result.response.status).toBe(status);
    expect(result.response.headers.get("Cache-Control")).toContain("private");
    expect(result.response.headers.get("Cache-Control")).toContain("no-store");
    expect(result.response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("rejects an absent Origin even with spoofed trusted forwarded headers", async () => {
    const req = request({ Host: "localhost:3000", "X-Forwarded-Host": "localhost:3000" });
    req.headers.delete("Origin");
    const result = await readAuthMutation(req);
    expect(result.ok).toBe(false);
  });
});
