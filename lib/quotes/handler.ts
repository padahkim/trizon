import { quoteKeySchema, type QuoteProvider } from "./types";

export function createQuoteHandler(provider: QuoteProvider) {
  return async function get(request: Request): Promise<Response> {
    const parsed = quoteKeySchema.array().min(1).safeParse(new URL(request.url).searchParams.get("keys")?.split(","));
    const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (!parsed.success) return json({ error: "시세 키 형식이 올바르지 않습니다" }, 400);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("quote timeout")), 10_000);
      });
      const quotes = await Promise.race([provider.fetchQuotes([...new Set(parsed.data)]), timeout]);
      return json({ quotes }, 200);
    } catch {
      return json({ error: "시세를 받지 못했습니다" }, 502);
    } finally {
      clearTimeout(timer);
    }
  };
}
