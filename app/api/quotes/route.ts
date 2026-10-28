import { createFakeProvider } from "@/lib/quotes/fake";
import { createQuoteHandler } from "@/lib/quotes/handler";
import { createYahooProvider } from "@/lib/quotes/yahoo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const provider = process.env.TRIZON_QUOTES === "fake" ? createFakeProvider() : createYahooProvider();
  return createQuoteHandler(provider)(request);
}
