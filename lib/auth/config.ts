export type AuthConfig = { url: string; publishableKey: string };

// Called only when an auth module is explicitly activated. The phase-one app needs no env vars.
export function readAuthConfig(): AuthConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase authentication is not configured");
  return { url, publishableKey };
}
