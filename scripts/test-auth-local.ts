import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

// Read ephemeral local credentials without printing or writing them to the repository.
try {
  const raw = execFileSync(resolve("node_modules/.bin/supabase"), [
    "stack", "status", "--stack", process.env.TRIZON_AUTH_STACK ?? "trizon-auth-tests", "--output-format", "json",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const status = JSON.parse(raw);
  const env = status.env;
  if (!env?.API_URL || !env.PUBLISHABLE_KEY || !env.DB_URL) throw new Error("not ready");
  if (new URL(env.API_URL).hostname !== "127.0.0.1" || new URL(env.DB_URL).hostname !== "127.0.0.1") throw new Error("not local");
  const run = spawnSync(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.auth-local.config.ts"], {
    stdio: "inherit", env: { ...process.env, TRIZON_AUTH_TEST_URL: env.API_URL, TRIZON_AUTH_TEST_KEY: env.PUBLISHABLE_KEY, TRIZON_AUTH_TEST_DB: env.DB_URL },
  });
  process.exitCode = run.status ?? 1;
} catch {
  console.error("Local auth tests require the isolated Supabase stack. See docs/AUTH-DEVELOPMENT.md.");
  process.exitCode = 1;
}
