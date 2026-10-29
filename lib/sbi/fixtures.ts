// e2e/acceptance.spec.ts completion criteria: JP-A → 1111, JP-B → 999A. Entirely fake holdings.
export const portfolioCsv = "ポートフォリオ一覧\r\n株式(現物/特定預り)\r\n銘柄(コード),数量,取得単価,現在値\r\n1111 JP-A,10,\"1,000\",\"1,200\"\r\n999A JP-B,10,900,800\r\n株式(現物/特定預り)合計\r\n評価額,含み損益\r\n\"20,000\",\"1,000\"\r\n総合計\r\n評価額,含み損益\r\n\"20,000\",\"1,000\"\r\n";

export const portfolioUtf8 = new TextEncoder().encode(portfolioCsv);

// e2e/acceptance.spec.ts completion criteria: US-A → TSTA, US-B → TSTB. Fake USD-settled buys.
export const usTradesCsv = "約定履歴\r\n国内約定日,銘柄,銘柄コード,商品区分,取引,預り区分,約定数量,約定単価,国内受渡日,受渡金額/決済損益\r\n2026/10/01,US-A,TSTA,米国株式,現買,特定,4,50.00USD,2026/10/05,200.00USD\r\n2026/10/01,US-B,TSTB,米国株式,現買,特定,2,20.00USD,2026/10/05,40.00USD\r\n";
export const usTradesUtf8 = new TextEncoder().encode(usTradesCsv);

// CP932/Shift_JIS bytes; TextEncoder only produces UTF-8.
const shiftJisHex = "837c815b836783748348838a834988ea97970d0a8a948eae288cbb95a82f93c192e8976182e8290d0a96c195bf288352815b8368292c909497ca2c8ee693be925089bf2c8cbb8ddd926c0d0a31313131204a502d412c31302c22312c303030222c22312c323030220d0a39393941204a502d422c31302c3930302c3830300d0a8a948eae288cbb95a82f93c192e8976182e8298d878c760d0a955d89bf8a7a2c8adc82dd91b989760d0a2232302c303030222c22312c303030220d0a918d8d878c760d0a955d89bf8a7a2c8adc82dd91b989760d0a2232302c303030222c22312c303030220d0a";
export const portfolioShiftJis = Uint8Array.from(shiftJisHex.match(/../g)!, (byte) => Number.parseInt(byte, 16));
