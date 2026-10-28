import { vi } from "vitest";

// Unit and route tests must use fake providers; live Yahoo belongs in quote:smoke.
vi.stubGlobal("fetch", () => { throw new Error("Network access is disabled in npm test"); });
