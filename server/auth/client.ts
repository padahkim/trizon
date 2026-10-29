import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isAuthError, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, type NextResponse } from "next/server";
import { readAuthConfig, type AuthConfig } from "../../lib/auth/config";
import { authIdentitySchema, identityFromClaims, sameIdentity, type AuthIdentity } from "../../lib/auth/identity";
import { privateAuthResponse } from "../../lib/auth/http";
import { authFetch } from "../../lib/auth/transport";

export type ServerAuthResult =
  | { status: "authenticated"; identity: AuthIdentity }
  | { status: "signed_out" | "expired" | "invalid" | "unavailable" };

// Each call owns its client, request cookie jar, writes and cache headers.
export function createServerAuth(request: NextRequest, config: AuthConfig = readAuthConfig(), fetcher: typeof fetch = fetch) {
  const cookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const cacheHeaders = new Headers();
  const client = createServerClient(config.url, config.publishableKey, {
    global: { fetch: authFetch(fetcher) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(writes, headers) {
        for (const cookie of writes) {
          request.cookies.set(cookie.name, cookie.value);
          cookies.set(cookie.name, cookie);
        }
        for (const [name, value] of Object.entries(headers)) cacheHeaders.set(name, value);
      },
    },
  });
  return {
    client,
    apply<T extends NextResponse>(response: T): T {
      privateAuthResponse(response);
      for (const [name, value] of cacheHeaders) response.headers.set(name, value);
      for (const { name, value, options } of cookies.values()) response.cookies.set(name, value, options);
      return response;
    },
  };
}

export async function verifyServerAuth(client: SupabaseClient): Promise<ServerAuthResult> {
  try {
    // getClaims verifies/refreshes the JWT; it does not prove immediate session revocation.
    const { data, error } = await client.auth.getClaims();
    if (error) return { status: authFailure(error) };
    if (!data) return { status: "signed_out" };
    const identity = identityFromClaims(data.claims);
    if (!identity) return { status: "invalid" };
    // Fetch current Auth user state rather than trusting the cookie's user object.
    const { data: current, error: userError } = await client.auth.getUser();
    if (userError) return { status: authFailure(userError) };
    if (current.user?.id !== identity.uid) return { status: "invalid" };
    return { status: "authenticated", identity };
  } catch (error) {
    return { status: authFailure(error) };
  }
}

export async function verifyBoundServerAuth(client: SupabaseClient, expected: unknown): Promise<ServerAuthResult | { status: "stale" }> {
  const result = await verifyServerAuth(client);
  if (result.status !== "authenticated") return result;
  const binding = authIdentitySchema.safeParse(expected);
  // A caller-supplied identifier can only narrow the authenticated session, never authorize it.
  return binding.success && sameIdentity(result.identity, binding.data) ? result : { status: "stale" };
}

function authFailure(error: unknown): "signed_out" | "expired" | "invalid" | "unavailable" {
  if (isAuthSessionMissingError(error)) return "expired";
  if (!isAuthError(error) || !error.status || error.status >= 500 || error.status === 429) return "unavailable";
  if (["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "user_not_found", "user_banned"].includes(error.code ?? "")) return "expired";
  return "invalid";
}
