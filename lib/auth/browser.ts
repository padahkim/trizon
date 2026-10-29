import { createBrowserClient, type CookieMethodsBrowser } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readAuthConfig, type AuthConfig } from "./config";
import { createAuthCoordinator, type AuthWork } from "./coordinator";
import { authIdentitySchema, identityFromClaims, sameIdentity, type AuthIdentity } from "./identity";
import { authFetch } from "./transport";

// Use the SDK's document.cookie adapter and browser singleton in the app.
// Custom cookie jars keep isolated local SDK tests independent.
export function createBrowserAuth(config: AuthConfig = readAuthConfig(), cookies?: CookieMethodsBrowser, fetcher: typeof fetch = fetch) {
  return createBrowserClient(config.url, config.publishableKey, {
    ...(cookies ? { cookies, isSingleton: false } : {}),
    auth: { detectSessionInUrl: false }, // callback exchange belongs to the server handler
    global: { fetch: authFetch(fetcher) },
  });
}

// Decoding here is advisory lifecycle bookkeeping, never JWT verification or authorization.
function sessionIdentity(session: Session | null): AuthIdentity | null {
  if (!session) return null;
  try {
    const claims = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const identity = identityFromClaims(claims);
    return identity?.uid === session.user.id ? identity : null;
  } catch { return null; }
}

export function bindBrowserAuth(client: SupabaseClient) {
  const coordinator = createAuthCoordinator();
  let disposed = false;
  const signalKey = "trizon:auth-lifecycle";
  let seenSignal: string | null | undefined;
  // A shared revision also catches ABA when a suspended tab misses all events.
  // It contains no tokens or assets and is only an invalidation hint.
  function syncSignal(): boolean {
    if (typeof window === "undefined") return true;
    try {
      const current = window.localStorage.getItem(signalKey);
      if (current !== seenSignal) { seenSignal = current; coordinator.invalidate(); }
      return true;
    } catch { coordinator.invalidate(); return false; }
  }
  function publishSignal(identity: AuthIdentity | null): boolean {
    if (typeof window === "undefined") return true;
    try {
      const current = window.localStorage.getItem(signalKey);
      let previous: { identity: AuthIdentity | null; revision: string } | null = null;
      try {
        const parsed = JSON.parse(current ?? "null");
        if (parsed && typeof parsed.revision === "string" &&
            (parsed.identity === null || authIdentitySchema.safeParse(parsed.identity).success)) previous = parsed;
      } catch { /* Replace an unreadable invalidation hint without trusting it. */ }
      if (!previous || !sameIdentity(previous.identity, identity)) {
        window.localStorage.setItem(signalKey, JSON.stringify({ identity, revision: crypto.randomUUID() }));
      }
      return syncSignal();
    } catch { coordinator.invalidate(); return false; }
  }
  const onStorage = (event: StorageEvent) => { if (event.key === signalKey || event.key === null) syncSignal(); };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    if (!disposed) {
      const identity = sessionIdentity(session);
      publishSignal(identity);
      coordinator.observe(identity);
    }
  });
  async function reconcile(): Promise<boolean> {
    if (disposed || !syncSignal()) return false;
    const generation = coordinator.generation;
    try {
      const { data, error } = await client.auth.getSession();
      if (disposed || !syncSignal()) return false;
      if (error) { coordinator.invalidate(); return false; }
      const next = sessionIdentity(data.session);
      // An auth event may have arrived while this cookie read was in flight.
      if (coordinator.generation !== generation && !sameIdentity(coordinator.snapshot(), next)) return false;
      if (!publishSignal(next)) return false;
      coordinator.observe(next);
      return true;
    } catch { coordinator.invalidate(); return false; }
  }
  return {
    snapshot: coordinator.snapshot,
    subscribe: coordinator.subscribe,
    async prepare(): Promise<AuthWork | null> {
      return await reconcile() ? coordinator.prepare() : null;
    },
    async canSend(work: AuthWork): Promise<boolean> {
      return coordinator.canSend(work) && await reconcile() && coordinator.canSend(work);
    },
    async canReceive(work: AuthWork, responder: unknown): Promise<boolean> {
      return await reconcile() && coordinator.canReceive(work, responder);
    },
    dispose() {
      disposed = true;
      coordinator.invalidate();
      subscription.unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    },
  };
}
