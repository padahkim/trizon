import { describe, expect, it } from "vitest";
import { config, cookieJar, json, session, sidA, sidB, uidA, uidB, user } from "../../tests/auth/fixtures";
import { bindBrowserAuth, createBrowserAuth } from "./browser";

describe("browser SDK lifecycle binding", () => {
  it("notices a second tab's cookie change before sending/receiving, even before a broadcast arrives", async () => {
    const cookies = cookieJar();
    const fetcher: typeof fetch = async (_input, init) => json(user(new Headers(init?.headers).get("Authorization")?.includes(session(uidB, sidB).access_token) ? uidB : uidA));
    const tabA = createBrowserAuth(config, cookies, fetcher);
    const tabB = createBrowserAuth(config, cookies, fetcher);
    await tabA.auth.setSession(session());
    const auth = bindBrowserAuth(tabA);
    const old = (await auth.prepare())!;
    expect(await auth.canSend(old)).toBe(true);
    await tabB.auth.setSession(session(uidB, sidB));
    expect(await auth.canSend(old)).toBe(false);
    const current = (await auth.prepare())!;
    expect(current.identity).toEqual({ uid: uidB, sessionId: sidB });
    expect(await auth.canReceive(current, { uid: uidA, sessionId: sidA })).toBe(false);
    expect(await auth.canReceive(current, { uid: uidB, sessionId: sidB })).toBe(true);
    auth.dispose();
    expect(await auth.canSend(current)).toBe(false);
  });
});
