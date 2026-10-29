"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { currentUsdJpyRate, usdJpyRateSchema, type UsdJpyRate } from "@/lib/fx/types";

const responseSchema = z.object({ rate: usdJpyRateSchema });
type RateState = { rate?: UsdJpyRate; loading: boolean; failed: boolean };

export function useExchangeRate(enabled: boolean) {
  const [state, setState] = useState<RateState>({ loading: false, failed: false });
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    if (!enabled) {
      setState({ loading: false, failed: false });
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    const timer = setTimeout(() => {
      if (active.current !== controller || controller.signal.aborted) return;
      controller.abort();
      setState({ loading: false, failed: true });
    }, 10_000);
    try {
      const response = await fetch("/api/exchange-rate", { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("exchange rate unavailable");
      const rate = currentUsdJpyRate(responseSchema.parse(await response.json()).rate);
      if (!rate) throw new Error("exchange rate outdated");
      if (active.current === controller && !controller.signal.aborted) setState({ rate, loading: false, failed: false });
    } catch {
      if (active.current === controller && !controller.signal.aborted) setState({ loading: false, failed: true });
    } finally {
      clearTimeout(timer);
    }
  }, [enabled]);

  useEffect(() => {
    // Synchronize the public exchange rate only while dollar holdings exist.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => active.current?.abort();
  }, [refresh]);
  const rate = enabled ? currentUsdJpyRate(state.rate) : undefined;
  return { ...state, rate, failed: state.failed || Boolean(state.rate && !rate), refresh };
}
