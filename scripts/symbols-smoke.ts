// 실제 종목 목록을 받아 검색해 보는 확인용 (npm test 에는 넣지 않는다 — 네트워크에 의존한다).
// 사용법: npm run symbols:smoke -- 삼성전자 トヨタ 엔비디아 "tiger s&p"
//   data/symbols.json 은 건드리지 않는다 (받은 목록은 메모리에서만 쓴다)

import { MARKETS } from "../lib/domain/model.ts";
import { prepareIndex, searchSymbols } from "../lib/symbols/search.ts";
import { downloadSymbolIndex } from "../lib/symbols/sources.ts";

const queries = process.argv.slice(2);
if (queries.length === 0) queries.push("삼성전자", "에코프로", "kodex 200", "トヨタ", "도요타", "三菱UFJ", "엔비디아", "brk.b", "285A");

const started = Date.now();
try {
  const file = await downloadSymbolIndex();
  const counts = MARKETS.map((m) => `${m} ${file.entries.filter((e) => e.market === m).length}`).join(" · ");
  const kb = Math.round(Buffer.byteLength(JSON.stringify(file)) / 1024);
  console.log(`종목 목록: ${file.entries.length}개 (${counts}), ${kb}KB, ${Date.now() - started}ms`);
  for (const w of file.warnings) console.log(`  ⚠ ${w}`);

  const index = prepareIndex(file.entries);
  for (const q of queries) {
    const t = performance.now();
    const hits = searchSymbols(index, q, { limit: 5 });
    const ms = (performance.now() - t).toFixed(1);
    console.log(`\n"${q}" (${ms}ms)`);
    for (const h of hits) console.log(`  ${h.market} ${h.code.padEnd(7)} ${h.name}${h.kind ? ` [${h.kind}]` : ""}  ${h.aliases.join(" · ")}`);
    if (hits.length === 0) console.log("  (없음)");
  }
} catch (err) {
  console.log(`✗ 종목 목록 실패: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
