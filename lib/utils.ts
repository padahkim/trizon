import { createCn } from "cn/config"

// app/globals.css @theme 에 더한 이름. 모르면 cn("text-figure-xl", "text-ink") 가 text-figure-xl 을 글자색으로 보고 지운다
export const themeTokens = {
  text: [
    "figure-xl",
    "figure-lg",
    "figure-md",
    "title-lg",
    "title-md",
    "title-sm",
    "body-md",
    "body-sm",
    "label",
    "caption",
    "button-md",
    "button-sm",
    "badge",
    "name-ja",
  ],
  shadow: ["overlay"],
}

export const cn = createCn({ extend: { theme: themeTokens } })
