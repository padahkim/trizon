import { z } from "zod";

export const authIdentitySchema = z.object({ uid: z.uuid(), sessionId: z.uuid() });
export type AuthIdentity = z.infer<typeof authIdentitySchema>;

export function identityFromClaims(claims: { sub?: unknown; session_id?: unknown }): AuthIdentity | null {
  const parsed = authIdentitySchema.safeParse({ uid: claims.sub, sessionId: claims.session_id });
  return parsed.success ? parsed.data : null;
}

export function sameIdentity(a: AuthIdentity | null, b: AuthIdentity | null): boolean {
  return a === null || b === null ? a === b : a.uid === b.uid && a.sessionId === b.sessionId;
}
