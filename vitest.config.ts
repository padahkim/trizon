import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json 의 "@/*" 경로를 그대로 쓴다
  resolve: { tsconfigPaths: true },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ 는 Playwright 가 돌린다
    include: ["lib/**/*.test.ts", "server/**/*.test.ts", "app/**/*.test.ts", "spikes/**/*.test.ts"],
  },
});
