import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, json, session, sidA, uidA, user } from "../../tests/auth/fixtures";
import { authRequest } from "../../tests/auth/server-fixtures";
import { AUTH_MUTATION_HEADERS } from "../../lib/auth/http";
import { handleAuthCallback, handleGoogleLogin, handleLocalLogout } from "./handlers";

function mutation(url = "http://localhost:3000/auth/login", value: ReturnType<typeof session> | null = null) {
  return authRequest(value, url, { method: "POST", headers: { ...AUTH_MUTATION_HEADERS, Origin: "http://localhost:3000", Host: "evil.test", "X-Forwarded-Host": "evil.test" }, body: "{}" });
}

async function started() {
  const response = await handleGoogleLogin(mutation("http://evil.test/auth/login?next=https://evil.test"), config);
  const body = await response.json();
  const provider = new URL(body.url);
  const cookie = response.cookies.getAll().map(({ name, value }) => `${name}=${value}`).join("; ");
  return { response, provider, cookie };
}

describe("inactive OAuth handlers through official PKCE SDK", () => {
  it("creates PKCE state and exchanges through SDK with fixed internal destinations despite hostile redirect inputs", async () => {
    const { response, provider, cookie } = await started();
    expect(response.status).toBe(200);
    expect(provider.origin).toBe("https://auth.test");
    expect(provider.searchParams.get("provider")).toBe("google");
    expect(provider.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
    expect(provider.searchParams.get("code_challenge_method")).toBe("s256");
    expect(provider.searchParams.get("code_challenge")).toBeTruthy();
    expect(cookie).toContain("code-verifier");
    let exchanged = false;
    const callback = await handleAuthCallback(new NextRequest("http://evil.test/auth/callback?code=synthetic-code&next=https://evil.test", { headers: { Cookie: cookie, Host: "evil.test" } }), config, async (input, init) => {
      if (String(input).includes("/token")) {
        const body = JSON.parse(String(init?.body));
        expect(body.auth_code).toBe("synthetic-code");
        expect(body.code_verifier.length).toBeGreaterThan(40);
        exchanged = true;
        return json(session());
      }
      return json(user());
    });
    expect(exchanged).toBe(true);
    expect(callback.headers.get("Location")).toBe("http://localhost:3000/");
    expect(callback.headers.get("Cache-Control")).toContain("no-store");
    expect(callback.cookies.getAll().some(({ name }) => name === "sb-auth-auth-token")).toBe(true);
  });

  it.each(["?error=access_denied&error_description=secret", "", "?code=", "?code=a&code=b"])("returns a retryable fixed login destination for cancellation or malformed callback %s", async (query) => {
    const response = await handleAuthCallback(new NextRequest(`http://evil.test/auth/callback${query}`), config);
    expect(response.headers.get("Location")).toBe(`http://localhost:3000/login?reason=${query.includes("access_denied") ? "cancelled" : "oauth_failed"}`);
    expect(response.headers.get("Cache-Control")).toContain("private");
  });

  it.each(["flow_state_not_found", "flow_state_expired", "bad_code_verifier"])("rejects invalid/expired/reused code or verifier mismatch: %s", async (code) => {
    const { cookie } = await started();
    const response = await handleAuthCallback(new NextRequest("http://evil.test/auth/callback?code=invalid", { headers: { Cookie: cookie } }), config,
      async () => json({ code, message: "sensitive SQL/OAuth detail" }, 400));
    expect(response.headers.get("Location")).toBe("http://localhost:3000/login?reason=oauth_failed");
    expect(await response.text()).not.toContain("sensitive");
  });

  it("rejects a callback without verifier and never accesses an asset endpoint", async () => {
    const response = await handleAuthCallback(new NextRequest("http://localhost:3000/auth/callback?code=unbound"), config, async (input) => {
      expect(new URL(String(input)).pathname).toMatch(/^\/auth\/v1\//);
      return json({ code: "bad_code_verifier" }, 400);
    });
    expect(response.headers.get("Location")).toBe("http://localhost:3000/login?reason=oauth_failed");
  });

  it("requires the mutation guard for login and logout", async () => {
    const request = new NextRequest("http://localhost:3000/auth/logout", { method: "POST", body: "{}" });
    expect((await handleGoogleLogin(request, config)).status).toBe(403);
    expect((await handleLocalLogout(request, config)).status).toBe(403);
  });

  it("logs out only the current session with an explicit local scope", async () => {
    let scope: string | null = null;
    const response = await handleLocalLogout(mutation(undefined, session()), config, async (input) => {
      scope = new URL(String(input)).searchParams.get("scope");
      return new Response(null, { status: 204 });
    });
    expect(scope).toBe("local");
    expect(await response.json()).toEqual({ status: "signed_out", localSessionCleared: true });
    expect(response.cookies.get("sb-auth-auth-token")?.maxAge).toBe(0);
  });

  it("reports remote logout uncertainty separately from local credential removal", async () => {
    const response = await handleLocalLogout(mutation(undefined, session()), config, async () => json({ message: "secret SQL" }, 503));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "logout_unconfirmed", localSessionCleared: true });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("reports unknown local logout state when an expired session cannot be refreshed", async () => {
    vi.useFakeTimers();
    try {
      const pending = handleLocalLogout(mutation(undefined, session(uidA, sidA, true)), config, async () => json({}, 503));
      await vi.advanceTimersByTimeAsync(120_000);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "logout_unconfirmed", localSessionCleared: null });
    } finally { vi.useRealTimers(); }
  });
});
