import { SBI_GUIDES } from "@/lib/sbi/guide";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Dashboard() {
  return (
    <main className="mx-auto flex max-w-(--container-max) flex-col gap-8 px-6 py-12">
      <header className="grid gap-2">
        <p className="text-title-md">trizon</p>
        <h1 className="text-title-lg">대시보드</h1>
      </header>

      <section aria-labelledby="japan-brokers" className="grid gap-4">
        <h2 id="japan-brokers" className="text-title-lg">일본 증권사</h2>
        <Card role="region" aria-labelledby="sbi-broker">
          <CardHeader>
            <CardTitle><h3 id="sbi-broker">SBI증권</h3></CardTitle>
            <CardDescription>SBI증권에서 받은 CSV로 보유 주식을 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 rounded-lg border border-dashed border-line-strong bg-surface p-6">
              <h4 className="text-title-sm">CSV 올리기 안내</h4>
              <p className="text-body-md text-ink-2">아래 두 CSV를 SBI증권 사이트에서 받습니다.</p>
              <ul aria-label="받을 CSV" className="grid gap-6">
                {SBI_GUIDES.map((guide) => (
                  <li key={guide.kind} className="grid justify-items-start gap-2">
                    <h5 lang="ja" className="rounded-xs bg-surface-sunken px-2 py-1 text-name-ja">
                      {guide.name}
                    </h5>
                    <p className="text-body-sm">{guide.description}</p>
                    <p className="text-body-sm text-ink-2">
                      받는 곳: {" "}
                      <a
                        href={guide.helpUrl}
                        lang="ja"
                        target="_blank"
                        rel="noreferrer"
                        className="text-name-ja text-brand underline underline-offset-4 hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        {guide.path.join(" › ")}
                      </a>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="korea-brokers" className="flex items-center gap-4 rounded-lg bg-surface-sunken px-6 py-4">
        <h2 id="korea-brokers" className="shrink-0 text-title-sm">한국 증권사</h2>
        <p className="text-body-sm text-ink-2">연결된 증권사 없음</p>
      </section>
    </main>
  );
}
