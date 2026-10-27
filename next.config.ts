import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // yahoo-finance2 는 Node 전용 의존성을 쓰므로 번들하지 않고 런타임에 불러온다
  serverExternalPackages: ["yahoo-finance2"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
