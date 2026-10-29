import { describe, expect, it } from "vitest";
import { sidA, sidB, uidA, uidB } from "../../tests/auth/fixtures";
import { createAuthCoordinator } from "./coordinator";

const a = { uid: uidA, sessionId: sidA };
const b = { uid: uidB, sessionId: sidB };

describe("browser auth work boundary", () => {
  it("rejects old work after A to B to A, including when the final session id matches", () => {
    const auth = createAuthCoordinator();
    auth.observe(a);
    const work = auth.prepare()!;
    expect(auth.canSend(work)).toBe(true);
    auth.observe(b);
    auth.observe(a);
    expect(auth.canSend(work)).toBe(false);
    expect(auth.canReceive(work, a)).toBe(false);
  });

  it("rejects a previous request, another account/session response, and the same account's new session", () => {
    const auth = createAuthCoordinator();
    expect(auth.prepare()).toBeNull();
    auth.observe(a);
    const earlier = auth.prepare()!;
    const latest = auth.prepare()!;
    expect(auth.canReceive(earlier, a)).toBe(false);
    expect(auth.canReceive(latest, b)).toBe(false);
    expect(auth.canReceive(latest, { ...a, sessionId: sidB })).toBe(false);
    expect(auth.canReceive(latest, undefined)).toBe(false);
    expect(auth.canReceive(latest, { uid: uidA })).toBe(false);
    auth.observe({ ...a, sessionId: sidB });
    expect(auth.canSend(latest)).toBe(false);
  });

  it("preserves work during token renewal in the same session but invalidates on an uncertain lifecycle read", () => {
    const auth = createAuthCoordinator();
    auth.observe(a);
    const work = auth.prepare()!;
    auth.observe(a);
    expect(auth.canReceive(work, a)).toBe(true);
    auth.invalidate();
    expect(auth.canSend(work)).toBe(false);
  });

  it("can pass its public receive check as a callback without losing context", () => {
    const auth = createAuthCoordinator();
    auth.observe(a);
    const work = auth.prepare()!;
    const { canReceive } = auth;
    expect(canReceive(work, a)).toBe(true);
  });
});
