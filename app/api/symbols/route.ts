import type { NextRequest } from "next/server";
import { MARKETS, type Market } from "@/lib/domain/model.ts";
import { getSymbolService } from "@/lib/server.ts";

// 종목 검색 (HoldingForm 의 자동완성). GET /api/symbols?q=삼성&market=KR
// q 가 비어 있으면 목록만 준비한다 — 입력칸에 포커스가 가면 미리 불러 첫 검색을 빠르게 한다.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const m = request.nextUrl.searchParams.get("market");
  const preferMarket = (MARKETS as readonly string[]).includes(m ?? "") ? (m as Market) : undefined;
  const result = await getSymbolService().search(q.slice(0, 100), preferMarket);
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
