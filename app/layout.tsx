import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "trizon",
  description: "한·일 주식 자산 통합 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className={styles.header}>
          <div className={`shell ${styles.bar}`}>
            <Link href="/" className={styles.brand}>
              trizon
            </Link>
            <nav className={styles.nav}>
              <Link href="/">대시보드</Link>
              <Link href="/holdings">보유종목 관리</Link>
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
