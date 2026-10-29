import { NextResponse, type NextRequest } from "next/server";
import { readAuthConfig, type AuthConfig } from "../../lib/auth/config";
import { AUTH_ORIGIN, privateAuthResponse, readAuthMutation } from "../../lib/auth/http";
import { createServerAuth, verifyServerAuth } from "./client";

// Exported functions only: #34 will install route handlers and a Proxy.
export async function handleGoogleLogin(request: NextRequest, config?: AuthConfig, fetcher?: typeof fetch) {
  const mutation = await readAuthMutation(request);
  if (!mutation.ok) return privateAuthResponse(new NextResponse(mutation.response.body, mutation.response));
  const context = createServerAuth(request, config ?? readAuthConfig(), fetcher);
  const { data, error } = await context.client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${AUTH_ORIGIN}/auth/callback`, skipBrowserRedirect: true },
  });
  return context.apply(NextResponse.json(error ? { error: "oauth_failed" } : { url: data.url }, { status: error ? 503 : 200 }));
}

export async function handleAuthCallback(request: NextRequest, config?: AuthConfig, fetcher?: typeof fetch) {
  const redirect = (reason?: string) => privateAuthResponse(NextResponse.redirect(`${AUTH_ORIGIN}${reason ? `/login?reason=${reason}` : "/"}`, 303));
  const params = new URL(request.url).searchParams;
  if (request.method !== "GET") return privateAuthResponse(NextResponse.json({ error: "invalid_request" }, { status: 405 }));
  if (params.has("error")) return redirect(params.get("error") === "access_denied" ? "cancelled" : "oauth_failed");
  const codes = params.getAll("code");
  if (codes.length !== 1 || !codes[0]) return redirect("oauth_failed");
  const context = createServerAuth(request, config ?? readAuthConfig(), fetcher);
  const { error } = await context.client.auth.exchangeCodeForSession(codes[0]);
  if (error) return context.apply(redirect("oauth_failed"));
  const result = await verifyServerAuth(context.client);
  return context.apply(redirect(result.status === "authenticated" ? undefined : result.status === "unavailable" ? "unavailable" : "oauth_failed"));
}

export async function handleLocalLogout(request: NextRequest, config?: AuthConfig, fetcher?: typeof fetch) {
  const mutation = await readAuthMutation(request);
  if (!mutation.ok) return privateAuthResponse(new NextResponse(mutation.response.body, mutation.response));
  const context = createServerAuth(request, config ?? readAuthConfig(), fetcher);
  const { error } = await context.client.auth.signOut({ scope: "local" });
  // SDK versions may clear local credentials even when remote revocation fails.
  // This observation is lifecycle information, never authorization.
  const { data, error: sessionError } = await context.client.auth.getSession();
  const localSessionCleared = sessionError ? null : data.session === null;
  return context.apply(NextResponse.json({
    status: error || localSessionCleared !== true ? "logout_unconfirmed" : "signed_out",
    localSessionCleared,
  }, { status: error || localSessionCleared !== true ? 503 : 200 }));
}
