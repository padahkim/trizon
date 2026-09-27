import type { NextConfig } from "next";

// 로컬 전용 앱: 서버 런타임(Server Components·Server Actions)이 data/*.json 을 읽고 쓴다.
// 정적 export 는 쓰지 않는다.
const nextConfig: NextConfig = {
  // yahoo-finance2 는 Node 전용 의존성(tough-cookie 등)을 쓰므로 번들하지 않고 런타임에 require 한다.
  serverExternalPackages: ["yahoo-finance2"],
};

export default nextConfig;
