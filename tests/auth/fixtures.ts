import type { Session, User } from "@supabase/supabase-js";

export const config = { url: "https://auth.test", publishableKey: "sb_publishable_synthetic" };
export const uidA = "11111111-1111-4111-8111-111111111111";
export const uidB = "22222222-2222-4222-8222-222222222222";
export const sidA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const sidB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const user = (id = uidA): User => ({
  id, aud: "authenticated", role: "authenticated", email: `${id}@example.test`,
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
});
export function jwt(uid = uidA, sessionId = sidA, exp = Math.floor(Date.now() / 1000) + 3600) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, session_id: sessionId, exp, aud: "authenticated", role: "authenticated" })}.${Buffer.from("controlled-signature").toString("base64url")}`;
}
export function session(uid = uidA, sessionId = sidA, expired = false): Session {
  const expires_at = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  return { access_token: jwt(uid, sessionId, expires_at), refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, expires_at, user: user(uid) };
}
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "X-Supabase-Api-Version": "2024-01-01" } });

export function cookieJar() {
  const jar = new Map<string, string>();
  return {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (values: { name: string; value: string }[]) => {
      for (const { name, value } of values) {
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
    },
  };
}
