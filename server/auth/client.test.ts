import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { config, json, session, sidA, sidB, uidA, uidB, user } from "../../tests/auth/fixtures";
import { authRequest } from "../../tests/auth/server-fixtures";
import { createServerAuth, verifyServerAuth, verifyBoundServerAuth } from "./client";

describe("server authentication boundary using the official SDK", () => {
  it("refreshes an expired token, verifies the user and carries cookies and cache headers into a replacement response", async () => {
    const request = authRequest(session(uidA, sidA, true));
    const context = createServerAuth(request, config, async (input) => {
      return String(input).includes("/token") ? json(session()) : json(user());
    });
    expect(await verifyServerAuth(context.client)).toEqual({ status: "authenticated", identity: { uid: uidA, sessionId: sidA } });
    const response = context.apply(NextResponse.redirect("http://localhost:3000/"));
    expect(response.cookies.getAll().some((cookie) => cookie.value.startsWith("base64-"))).toBe(true);
    expect(request.cookies.get("sb-auth-auth-token")?.value).toBe(response.cookies.get("sb-auth-auth-token")?.value);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Cache-Control")).toContain("private");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it.each([
    ["refresh_token_not_found", 400, "expired"],
    ["session_not_found", 403, "expired"],
    ["bad_jwt", 401, "invalid"],
    ["auth_unavailable", 503, "unavailable"],
  ] as const)("distinguishes %s without exposing provider details", async (code, status, expected) => {
    const context = createServerAuth(authRequest(), config, async () => json({ code, message: "sensitive provider details" }, status));
    expect(await verifyServerAuth(context.client)).toEqual({ status: expected });
  });

  it("reports actual expiry when a refresh token is rejected", async () => {
    const context = createServerAuth(authRequest(session(uidA, sidA, true)), config,
      async () => json({ code: "refresh_token_not_found", message: "expired" }, 400));
    expect(await verifyServerAuth(context.client)).toEqual({ status: "expired" });
    expect(context.apply(NextResponse.json({})).cookies.get("sb-auth-auth-token")?.maxAge).toBe(0);
  });

  it("keeps users isolated across concurrent requests", async () => {
    const a = createServerAuth(authRequest(), config, async () => json(user(uidA)));
    const b = createServerAuth(authRequest(session(uidB, sidB)), config, async () => json(user(uidB)));
    expect(await Promise.all([verifyServerAuth(a.client), verifyServerAuth(b.client)])).toEqual([
      { status: "authenticated", identity: { uid: uidA, sessionId: sidA } },
      { status: "authenticated", identity: { uid: uidB, sessionId: sidB } },
    ]);
  });

  it("does not trust the stored user or turn an Auth transport failure into logout or logs", async () => {
    const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    try {
      const value = session();
      value.user = user(uidB);
      const context = createServerAuth(authRequest(value), config, async () => { throw new Error("secret URL/code/cookie"); });
      expect(await verifyServerAuth(context.client)).toEqual({ status: "unavailable" });
      expect(context.apply(NextResponse.json({})).cookies.getAll()).toEqual([]);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      logs.forEach((log) => log.mockRestore());
    }
  });

  it("returns signed_out for no session and invalid for malformed JWTs", async () => {
    const context = createServerAuth(authRequest(null), config);
    expect(await verifyServerAuth(context.client)).toEqual({ status: "signed_out" });
    const value = session();
    value.access_token = "tampered";
    expect(await verifyServerAuth(createServerAuth(authRequest(value), config).client)).toEqual({ status: "invalid" });
  });

  it("uses request identity solely to reject stale work, never to grant authentication", async () => {
    const expected = { uid: uidA, sessionId: sidA };
    expect(await verifyBoundServerAuth(createServerAuth(authRequest(null), config).client, expected)).toEqual({ status: "signed_out" });
    const context = () => createServerAuth(authRequest(), config, async () => json(user())).client;
    expect((await verifyBoundServerAuth(context(), expected)).status).toBe("authenticated");
    expect(await verifyBoundServerAuth(context(), { uid: uidB, sessionId: sidB })).toEqual({ status: "stale" });
    expect(await verifyBoundServerAuth(context(), { uid: uidA, sessionId: sidB })).toEqual({ status: "stale" });
    expect(await verifyBoundServerAuth(context(), { uid: uidA })).toEqual({ status: "stale" });
  });

  it("keeps refresh credentials during an Auth outage instead of declaring expiry", async () => {
    vi.useFakeTimers();
    try {
      const context = createServerAuth(authRequest(session(uidA, sidA, true)), config, async () => json({ message: "private upstream detail" }, 503));
      const pending = verifyServerAuth(context.client);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await pending).toEqual({ status: "unavailable" });
      expect(context.apply(NextResponse.json({})).cookies.getAll().length).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("removes sensitive provider detail before the SDK can log a refresh error", async () => {
    const logs = [vi.spyOn(console, "error").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {})];
    try {
      const value = session(uidA, sidA, true);
      const context = createServerAuth(authRequest(value), config, async () => json({ code: "refresh_token_not_found", message: `private SQL ${value.access_token} ${value.refresh_token}` }, 400));
      expect((await verifyServerAuth(context.client)).status).toBe("expired");
      const output = logs.flatMap((log) => log.mock.calls.flat()).map(String).join("\n");
      expect(output).not.toContain("private SQL");
      expect(output).not.toContain(value.access_token);
      expect(output).not.toContain(value.refresh_token);
    } finally { logs.forEach((log) => log.mockRestore()); }
  });
});
