import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { cn, themeTokens } from "./utils"

describe("cn", () => {
  it("글자 크기 토큰과 글자색을 함께 남긴다", () => {
    expect(cn("text-figure-xl", "text-ink")).toBe("text-figure-xl text-ink")
  })

  it("글자 크기 토큰끼리는 뒤의 것만 남긴다", () => {
    expect(cn("text-body-sm", "text-caption")).toBe("text-caption")
  })

  it("그림자 토큰과 그림자 색을 함께 남긴다", () => {
    expect(cn("shadow-overlay", "shadow-ink")).toBe("shadow-overlay shadow-ink")
  })
})

describe("themeTokens", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")

  it.each(Object.entries(themeTokens))("globals.css 의 --%s-* 이름과 같다", (key, names) => {
    const declared = [...css.matchAll(new RegExp(`^\\s*--${key}-([a-z0-9]+(?:-[a-z0-9]+)*):`, "gm"))].map((m) => m[1])
    expect(names).toEqual(declared)
  })
})
