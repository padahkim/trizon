import { authIdentitySchema, sameIdentity, type AuthIdentity } from "./identity";

export type AuthWork = Readonly<{ identity: Readonly<AuthIdentity>; generation: number; request: number }>;

// Lifecycle isolation only. None of these identifiers authorize server access.
export function createAuthCoordinator() {
  let identity: AuthIdentity | null = null;
  let generation = 0;
  let request = 0;
  const tickets = new WeakSet<AuthWork>();
  const listeners = new Set<() => void>();
  const canSend = (work: AuthWork) => tickets.has(work) && work.generation === generation && work.request === request && sameIdentity(identity, work.identity);
  return {
    get generation() { return generation; },
    snapshot() { return identity; },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    invalidate() { generation++; },
    observe(next: AuthIdentity | null) {
      if (!sameIdentity(identity, next)) {
        identity = next && Object.freeze({ ...next });
        generation++;
        for (const listener of listeners) listener();
      }
    },
    prepare(): AuthWork | null {
      if (!identity) return null;
      const work = Object.freeze({ identity: Object.freeze({ ...identity }), generation, request: ++request });
      tickets.add(work);
      return work;
    },
    canSend,
    canReceive(work: AuthWork, responder: unknown): boolean {
      const parsed = authIdentitySchema.safeParse(responder);
      return canSend(work) && parsed.success && sameIdentity(work.identity, parsed.data);
    },
  };
}
