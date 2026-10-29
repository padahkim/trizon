import type { Session } from "@supabase/supabase-js";
import { bindBrowserAuth, createBrowserAuth } from "../../lib/auth/browser";
import type { AuthConfig } from "../../lib/auth/config";
import type { AuthWork } from "../../lib/auth/coordinator";

// Bundled only by the independent local suite; never served by Next.js.
export function boot(config: AuthConfig) {
  const client = createBrowserAuth(config);
  const auth = bindBrowserAuth(client);
  const work = new Map<string, AuthWork>();
  return {
    snapshot: auth.snapshot,
    async signIn(session: Session) {
      const { error } = await client.auth.setSession(session);
      if (error) throw new Error("Local test session rejected");
    },
    async prepare(name: string) {
      const prepared = await auth.prepare();
      if (prepared) work.set(name, prepared);
      return prepared !== null;
    },
    async canSend(name: string) {
      const prepared = work.get(name);
      return prepared ? auth.canSend(prepared) : false;
    },
  };
}
