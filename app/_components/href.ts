export type SearchParams = Record<string, string | string[] | undefined>;

/** 지금 쿼리에 patch 를 덮어쓴 링크. undefined·빈 값은 뺀다 (기본값은 주소에 남기지 않는다) */
export function hrefWith(path: string, sp: SearchParams, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (typeof v === "string" && v !== "") params.set(k, v);
  }
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
