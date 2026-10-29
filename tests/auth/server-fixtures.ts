import type { Session } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { session } from "./fixtures";

export function authRequest(value: Session | null = session(), url = "http://localhost:3000/", init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (value) headers.set("Cookie", `sb-auth-auth-token=base64-${Buffer.from(JSON.stringify(value)).toString("base64url")}`);
  return new NextRequest(url, { ...init, headers, signal: init?.signal ?? undefined });
}
