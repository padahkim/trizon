import { fetchUsdJpyRate } from "@/lib/fx/yahoo";

export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const rate = process.env.TRIZON_QUOTES === "fake"
      ? { yenPerDollar: 150, asOf: new Date().toISOString() }
      : await fetchUsdJpyRate();
    return Response.json({ rate }, { headers });
  } catch {
    return Response.json({ error: "환율을 받지 못했습니다" }, { status: 502, headers });
  }
}
