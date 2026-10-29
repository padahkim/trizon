// The SDK can log failed refresh errors. Remove provider detail before it reaches the SDK.
// Never log request URLs, bodies, credentials, or the original exception.
const safeCodes = new Set([
  "bad_jwt", "session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used",
  "user_not_found", "user_banned", "flow_state_not_found", "flow_state_expired",
  "bad_code_verifier", "validation_failed", "invalid_credentials", "signup_disabled",
]);

export function authFetch(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const timeout = AbortSignal.timeout(5_000);
      const response = await fetcher(input, {
        ...init, cache: "no-store",
        signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
      if (response.ok) return response;
      const body: unknown = await response.json().catch(() => null);
      const suppliedCode = body && typeof body === "object" && "code" in body ? body.code : null;
      const code = typeof suppliedCode === "string" && safeCodes.has(suppliedCode) ? suppliedCode : "auth_request_failed";
      return Response.json({ code, message: "Authentication request failed" }, {
        status: response.status, headers: { "X-Supabase-Api-Version": "2024-01-01" },
      });
    } catch {
      return Response.json({ code: "auth_unavailable", message: "Authentication unavailable" }, { status: 503 });
    }
  };
}
