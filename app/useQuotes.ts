"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { Holding } from "@/lib/portfolio/types";
import { quoteKeySchema, quoteSchema, type QuoteKey, type Quotes } from "@/lib/quotes/types";

const responseSchema = z.object({ quotes: z.record(quoteKeySchema, quoteSchema) });
type QuoteState = { quotes: Quotes; loading: boolean; failed: boolean };

export function useQuotes(holdings: Holding[]) {
  const keys = useMemo(() => [...new Set(holdings.filter((holding) => holding.assetType !== "fund")
    .map((holding): QuoteKey => `${holding.market}:${holding.code}`))].sort(), [holdings]);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<QuoteState>({ quotes: {}, loading: false, failed: false });

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    if (!keys.length) {
      setState({ quotes: {}, loading: false, failed: false });
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    const timer = setTimeout(() => {
      if (active.current !== controller || controller.signal.aborted) return;
      controller.abort();
      setState({ quotes: {}, loading: false, failed: true });
    }, 10_000);
    try {
      const response = await fetch(`/api/quotes?keys=${encodeURIComponent(keys.join(","))}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("quote request failed");
      const result = responseSchema.parse(await response.json());
      if (active.current === controller && !controller.signal.aborted) setState({ quotes: result.quotes, loading: false, failed: false });
    } catch {
      if (active.current === controller && !controller.signal.aborted) setState({ quotes: {}, loading: false, failed: true });
    } finally {
      clearTimeout(timer);
    }
  }, [keys]);

  useEffect(() => {
    // Starting network synchronization sets loading while retaining the displayed valuation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => active.current?.abort();
  }, [refresh]);

  return { ...state, refresh };
}
