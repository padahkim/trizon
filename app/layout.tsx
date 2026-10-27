import type { Metadata } from "next";
import "./globals.css";
import { IBM_Plex_Sans_JP, IBM_Plex_Sans_KR } from "next/font/google";
import { cn } from "@/lib/utils";

// 한글·가나 글리프는 Google Fonts 가 unicode-range 조각으로 나눠 주고, 브라우저가 필요한 조각만 받는다.
// 미리 받는 것은 숫자·라틴(KR)뿐이다. --font-sans · --font-jp 가 이 변수를 쓴다 (globals.css)
const plexKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-kr",
});
const plexJp = IBM_Plex_Sans_JP({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-jp",
  preload: false,
});

export const metadata: Metadata = {
  title: "trizon",
  description: "일본·한국 증권사에 흩어진 주식을 한 화면에서 보는 개인용 대시보드",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={cn(plexKr.variable, plexJp.variable)}>
      <body>{children}</body>
    </html>
  );
}
