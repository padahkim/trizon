import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { createBrowserAuth, bindBrowserAuth } from "../../lib/auth/browser";
import { createServerAuth, verifyServerAuth } from "../../server/auth/client";
import { handleLocalLogout } from "../../server/auth/handlers";
import { AUTH_MUTATION_HEADERS } from "../../lib/auth/http";
import { cookieJar } from "./fixtures";
import { createChunks } from "@supabase/ssr";
import { build } from "esbuild";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import type { boot } from "./browser-harness";
type AuthTestWindow = typeof window & {
  TrizonAuthTest: { boot: typeof boot };
  authTest: ReturnType<typeof boot>;
};

const dbUrl = process.env.TRIZON_AUTH_TEST_DB ?? "";
if (!dbUrl || new URL(dbUrl).hostname !== "127.0.0.1") throw new Error("An isolated local database is required");
const db = postgres(dbUrl, { max: 1, onnotice: () => {} });
const adminUrl = new URL(dbUrl);
adminUrl.username = "supabase_admin";
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const emailA = `auth-a-${crypto.randomUUID()}@example.test`;
const emailB = `auth-b-${crypto.randomUUID()}@example.test`;
const password = "Synthetic-local-test-password-49";
const config = { url: process.env.TRIZON_AUTH_TEST_URL!, publishableKey: process.env.TRIZON_AUTH_TEST_KEY! };
if (new URL(config.url).hostname !== "127.0.0.1") throw new Error("Local Auth is required");

function browser(cookies = cookieJar()) {
  return { client: createBrowserAuth(config, cookies), cookies };
}
async function login(email = emailA) {
  const value = browser();
  const { data, error } = await value.client.auth.signInWithPassword({ email, password });
  expect(error?.code ?? null).toBeNull();
  if (!data.session) throw new Error("Synthetic local login failed");
  return { ...value, session: data.session };
}
function serverRequest(cookies: ReturnType<typeof cookieJar>, mutation = false) {
  return new NextRequest("http://localhost:3000/auth/logout", {
    method: mutation ? "POST" : "GET",
    headers: { Cookie: cookies.getAll().map(({ name, value }) => `${name}=${value}`).join("; "), ...(mutation ? { ...AUTH_MUTATION_HEADERS, Origin: "http://localhost:3000" } : {}) },
    ...(mutation ? { body: "{}" } : {}),
  });
}

beforeAll(async () => {
  const migration = await readFile("supabase/migrations/20261030000000_owner_signup_hook.sql", "utf8");
  await db.unsafe(migration);
  await db`insert into trizon_auth.owner_allowlist (email) values (${emailA}), (${emailB})`;
  for (const email of [emailA, emailB]) {
    const { error } = await browser().client.auth.signUp({ email, password });
    expect(error?.code ?? null).toBeNull();
  }
});
afterAll(async () => {
  await admin`delete from auth.users where email in (${emailA}, ${emailB})`.catch(() => {});
  await db`delete from trizon_auth.owner_allowlist where email in (${emailA}, ${emailB})`.catch(() => {});
  await db.end();
  await admin.end();
});

describe("real local Supabase SQL hook", () => {
  it("permits only the Auth-owned email, rejecting missing or forged user_metadata", async () => {
    await admin.begin(async (tx) => {
      await tx`set local role supabase_auth_admin`;
      const invoke = async (event: unknown) => (await tx`select trizon_auth.before_user_created(${tx.json(event as postgres.JSONValue)}) as result`)[0].result;
      expect(await invoke({ user: { email: emailA.toUpperCase() } })).toEqual({});
      expect((await invoke({ user: {} })).error.http_code).toBe(403);
      expect((await invoke({ user: { email: "outside@example.test", user_metadata: { email: emailA } } })).error.http_code).toBe(403);
    });
  });

  it.each(["anon", "authenticated"] as const)("denies %s direct hook invocation and allowlist read/write", async (role) => {
    for (const query of [
      "select trizon_auth.before_user_created('{}'::jsonb)",
      "select email from trizon_auth.owner_allowlist",
      "insert into trizon_auth.owner_allowlist values ('bypass@example.test')",
      "update trizon_auth.owner_allowlist set email = 'bypass@example.test'",
      "delete from trizon_auth.owner_allowlist",
    ]) {
      await expect(admin.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`);
        await tx.unsafe(query);
      })).rejects.toMatchObject({ code: "42501" });
    }
    const [row] = await db`select has_function_privilege(${role}, 'trizon_auth.before_user_created(jsonb)', 'EXECUTE') as allowed`;
    expect(row.allowed).toBe(false); // includes PUBLIC's inherited privileges
  });

  it("gives supabase_auth_admin no allowlist write capability", async () => {
    await expect(admin.begin(async (tx) => {
      await tx`set local role supabase_auth_admin`;
      await tx`insert into trizon_auth.owner_allowlist values ('bypass@example.test')`;
    })).rejects.toMatchObject({ code: "42501" });
  });

  it("fails closed with a generic hook error when its table access fails", async () => {
    await expect(admin.begin(async (tx) => {
      await tx`revoke select (email) on trizon_auth.owner_allowlist from supabase_auth_admin`;
      await tx`set local role supabase_auth_admin`;
      const [row] = await tx`select trizon_auth.before_user_created(${tx.json({ user: { email: emailA } })}) as result`;
      expect(row.result).toEqual({ error: { http_code: 500, message: "Signup check unavailable" } });
      throw new Error("rollback-test-grants");
    })).rejects.toThrow("rollback-test-grants");
  });

  it("denies a real Auth signup outside the allowlist despite forged metadata", async () => {
    const { data, error } = await browser().client.auth.signUp({
      email: `outside-${crypto.randomUUID()}@example.test`, password,
      options: { data: { email: emailA, allowed: true, role: "supabase_auth_admin" } },
    });
    expect(error?.status).toBe(403);
    expect(data.session === null).toBe(true);
  });
});

describe("real local Supabase session lifecycle", () => {
  it("keeps A and B requests isolated and refreshes a real session with SSR headers", async () => {
    const a = await login();
    const b = await login(emailB);
    const ca = createServerAuth(serverRequest(a.cookies), config);
    const cb = createServerAuth(serverRequest(b.cookies), config);
    const [va, vb] = await Promise.all([verifyServerAuth(ca.client), verifyServerAuth(cb.client)]);
    expect(va.status).toBe("authenticated");
    expect(vb.status).toBe("authenticated");
    if (va.status !== "authenticated" || vb.status !== "authenticated") throw new Error("Auth failed");
    expect(va.identity.uid).toBe(a.session.user.id);
    expect(vb.identity.uid).toBe(b.session.user.id);
    expect(va.identity.sessionId === vb.identity.sessionId).toBe(false);
    const refreshed = await ca.client.auth.refreshSession();
    expect(refreshed.error?.code ?? null).toBeNull();
    const response = ca.apply(NextResponse.redirect("http://localhost:3000/"));
    expect(response.cookies.getAll().length > 0).toBe(true);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
  });

  it("rejects a tampered or expired JWT using the real Auth service", async () => {
    const { client, session } = await login();
    const parts = session.access_token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: crypto.randomUUID() })).toString("base64url");
    expect((await client.auth.getClaims(parts.join("."))).error !== null).toBe(true);
    parts[1] = Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString("base64url");
    expect((await client.auth.getClaims(parts.join("."))).error !== null).toBe(true);
  });

  it("reports expired after a real server session deadline at its next refresh", async () => {
    const a = await login();
    const { data } = await a.client.auth.getClaims();
    if (!data) throw new Error("Missing local claims");
    await admin`update auth.sessions set not_after = now() - interval '1 second' where id = ${data.claims.session_id}`;
    // Model the next SSR refresh without waiting for the access token's remaining lifetime.
    const cookies = cookieJar();
    const key = a.cookies.getAll()[0].name.replace(/\.\d+$/, "");
    cookies.setAll(createChunks(key, `base64-${Buffer.from(JSON.stringify({ ...a.session, expires_at: 1 })).toString("base64url")}`));
    const context = createServerAuth(serverRequest(cookies), config);
    expect((await verifyServerAuth(context.client)).status).toBe("expired");
  });

  it("local logout revokes the current refresh session while another device and account remain active", async () => {
    const a = await login();
    const otherDevice = await login();
    const b = await login(emailB);
    const response = await handleLocalLogout(serverRequest(a.cookies, true), config);
    expect((await response.json()).status).toBe("signed_out");
    expect(response.cookies.getAll().some(({ maxAge }) => maxAge === 0)).toBe(true);
    expect((await a.client.auth.refreshSession({ refresh_token: a.session.refresh_token })).error !== null).toBe(true);
    expect((await otherDevice.client.auth.refreshSession()).error === null).toBe(true);
    expect((await b.client.auth.getUser()).data.user?.id).toBe(b.session.user.id);
  });

  it("binds work to real account/session identities across two SDK cookie readers", async () => {
    const a = await login();
    const b = await login(emailB);
    const newA = await login();
    const tab = browser(a.cookies);
    const bound = bindBrowserAuth(a.client);
    const old = (await bound.prepare())!;
    await tab.client.auth.setSession(b.session);
    expect(await bound.canSend(old)).toBe(false);
    await bound.prepare();
    await tab.client.auth.setSession(a.session);
    expect(await bound.canReceive(old, old.identity)).toBe(false);
    const current = (await bound.prepare())!;
    await tab.client.auth.setSession(newA.session);
    expect(await bound.canSend(current)).toBe(false);
    bound.dispose();
  });

  it("invalidates work across two real browser tabs for A → B → A and same-account new sessions", async () => {
    const a = await login();
    const b = await login(emailB);
    const newA = await login();
    const bundle = await build({ entryPoints: ["tests/auth/browser-harness.ts"], bundle: true, write: false, platform: "browser", format: "iife", globalName: "TrizonAuthTest" });
    const server = createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
      else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><title>Isolated auth test</title><script src="/bundle.js"></script>'); }
    });
    await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const pageA = await context.newPage();
      const pageB = await context.newPage();
      for (const page of [pageA, pageB]) {
        await page.goto(`http://localhost:${address.port}`);
        await page.evaluate((cfg) => { const w = window as AuthTestWindow; w.authTest = w.TrizonAuthTest.boot(cfg); }, config);
      }
      await pageA.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), a.session);
      expect(await pageA.evaluate(() => (window as AuthTestWindow).authTest.prepare("old"))).toBe(true);
      await pageB.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), b.session);
      await pageA.waitForFunction((uid) => (window as AuthTestWindow).authTest.snapshot()?.uid === uid, b.session.user.id);
      await pageB.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), a.session);
      await pageA.waitForFunction((uid) => (window as AuthTestWindow).authTest.snapshot()?.uid === uid, a.session.user.id);
      expect(await pageA.evaluate(() => (window as AuthTestWindow).authTest.canSend("old"))).toBe(false);
      expect(await pageA.evaluate(() => (window as AuthTestWindow).authTest.prepare("current"))).toBe(true);
      await pageB.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), newA.session);
      const newClaims = await newA.client.auth.getClaims();
      await pageA.waitForFunction((sid) => (window as AuthTestWindow).authTest.snapshot()?.sessionId === sid, newClaims.data!.claims.session_id);
      expect(await pageA.evaluate(() => (window as AuthTestWindow).authTest.canSend("current"))).toBe(false);
      const cookies = await context.cookies();
      expect(cookies.length > 0).toBe(true);
      expect(cookies.every((cookie) => !cookie.httpOnly && cookie.sameSite === "Lax" && cookie.path === "/")).toBe(true);

      // A background tab can miss both broadcasts and storage events. Its final cookie
      // may again be A, so comparing uid/session_id alone cannot detect this ABA.
      const missed = await context.newPage();
      await missed.addInitScript(() => {
        Object.defineProperty(window, "BroadcastChannel", { value: undefined });
        window.addEventListener("storage", (event) => event.stopImmediatePropagation(), true);
      });
      await missed.goto(`http://localhost:${address.port}`);
      await missed.evaluate((cfg) => { const w = window as AuthTestWindow; w.authTest = w.TrizonAuthTest.boot(cfg); }, config);
      expect(await missed.evaluate(() => (window as AuthTestWindow).authTest.prepare("missed"))).toBe(true);
      await pageB.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), b.session);
      await pageB.evaluate((session) => (window as AuthTestWindow).authTest.signIn(session), newA.session);
      expect(await missed.evaluate(() => (window as AuthTestWindow).authTest.canSend("missed"))).toBe(false);

      const blockedStorage = await context.newPage();
      await blockedStorage.addInitScript(() => {
        Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
      });
      await blockedStorage.goto(`http://localhost:${address.port}`);
      await blockedStorage.evaluate((cfg) => { const w = window as AuthTestWindow; w.authTest = w.TrizonAuthTest.boot(cfg); }, config);
      expect(await blockedStorage.evaluate(() => (window as AuthTestWindow).authTest.prepare("blocked"))).toBe(false);
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
