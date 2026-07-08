# FinMind 整合 M1:歷史回填 + 每日 ingest 補上櫃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 `lib/finmind/` client 層,全市場(上市+上櫃)5 年日線回填進 `DailyQuote`,每日 ingest 加 TPEX 上櫃源。

**Architecture:** FinMind 只走 script/cron 路徑(client 層含節流/退避/錯誤分類);每日 ingest 為 TWSE(上市)+TPEX(上櫃)雙免費源、獨立容錯;回填逐檔呼叫 FinMind、`createMany skipDuplicates` 批次寫入、可斷點續跑。DB schema 不變(Stock.market/industry 本來就存在,只是回填值)。

**Tech Stack:** Next.js 16 / TypeScript strict / Prisma(MySQL)/ Vitest / tsx scripts(esbuild 編進 image)。

**Spec:** `docs/superpowers/specs/2026-07-08-nazodex-finmind-integration-design.md`

## Global Constraints

- TDD:每個功能先寫失敗測試。測試用 `describe/it/expect`(vitest),既有風格見 `lib/ingest/__tests__/twseOpenApi.test.ts`(中文 it 描述)。
- `FINMIND_TOKEN` 為純 JWT;client 必須防禦性 strip `Bearer ` 前綴。
- FinMind 節流常數 600 calls/hr,集中在 client 層。
- 外部 fetch 一律 8s AbortController(既有模式);`fetchImpl: typeof fetch = fetch` 依賴注入。
- `DailyQuote.date` 存 UTC 午夜(`new Date(\`${iso}T00:00:00Z\`)`)。
- 回填/補洞寫入**不覆蓋既有列**(`createMany skipDuplicates` 或 upsert `update: {}`)。
- 每個 Task 結束跑 `pnpm test` 全綠再 commit;commit 訊息中文、格式同 git log。

---

### Task 1: FinMind client(節流/退避/錯誤分類)

**Files:**
- Create: `lib/finmind/types.ts`
- Create: `lib/finmind/client.ts`
- Test: `lib/finmind/__tests__/client.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`:`FinMindParams = { dataset: string; data_id?: string; start_date?: string; end_date?: string }`;錯誤類別 `FinMindAuthError` / `FinMindLevelError` / `FinMindRateLimitError`(皆 extends Error)。
  - `client.ts`:`FinMindClient = { fetchDataset<T = unknown>(params: FinMindParams): Promise<T[]> }`;`createFinMindClient(deps?: FinMindDeps): FinMindClient`;`FinMindDeps = { fetchImpl?, sleep?, now?, token?, callsPerHour? }`;常數 `FINMIND_CALLS_PER_HOUR = 600`。

- [ ] **Step 1: 寫失敗測試**

`lib/finmind/__tests__/client.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createFinMindClient } from "@/lib/finmind/client";
import { FinMindAuthError, FinMindLevelError, FinMindRateLimitError } from "@/lib/finmind/types";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function okBody(data: unknown[] = [{ x: 1 }]) {
  return { msg: "success", status: 200, data };
}

describe("createFinMindClient", () => {
  it("組出正確 URL:dataset/data_id/日期/token,且 strip Bearer 前綴", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody()));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      token: "Bearer  eyJabc",
      sleep: async () => {},
      now: () => 0,
    });
    await client.fetchDataset({ dataset: "TaiwanStockPrice", data_id: "2330", start_date: "2021-07-01", end_date: "2026-07-08" });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("dataset=TaiwanStockPrice");
    expect(url).toContain("data_id=2330");
    expect(url).toContain("token=eyJabc");
    expect(url).not.toContain("Bearer");
  });

  it("成功回 data 陣列;data 非陣列回 []", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(okBody([{ a: 1 }, { a: 2 }])))
      .mockResolvedValueOnce(jsonResponse({ msg: "success", status: 200, data: null }));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    expect(await client.fetchDataset({ dataset: "d" })).toHaveLength(2);
    expect(await client.fetchDataset({ dataset: "d" })).toEqual([]);
  });

  it("節流:兩次呼叫間 sleep 至少 minInterval(600/hr → 6000ms)", async () => {
    const sleeps: number[] = [];
    let t = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(okBody()));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => t, // 時間凍結:第二次呼叫時 now 未前進,應 sleep 整個間隔
    });
    await client.fetchDataset({ dataset: "d" });
    await client.fetchDataset({ dataset: "d" });
    expect(sleeps.some((ms) => ms >= 6000)).toBe(true);
  });

  it("HTTP 402 限流:退避重試 3 次後拋 FinMindRateLimitError", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "limit" }, 402));
    const client = createFinMindClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms) => { sleeps.push(ms); },
      now: () => 0,
    });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps.filter((ms) => ms === 60_000)).toHaveLength(2);
  });

  it("Token is illegal → FinMindAuthError(訊息含 Bearer 提示)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "Token is illegal.", status: 400 }, 400));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindAuthError);
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toThrow(/Bearer/);
  });

  it("Your level is register → FinMindLevelError", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "Your level is register. Please update your user level.", status: 400 }, 400));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toBeInstanceOf(FinMindLevelError);
  });

  it("其他非 200 → 一般 Error(不重試)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ msg: "boom", status: 500 }, 500));
    const client = createFinMindClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {}, now: () => 0 });
    await expect(client.fetchDataset({ dataset: "d" })).rejects.toThrow(/boom|500/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run lib/finmind`
Expected: FAIL(模組不存在)

- [ ] **Step 3: 實作**

`lib/finmind/types.ts`:

```ts
export type FinMindParams = {
  dataset: string;
  data_id?: string;
  start_date?: string;
  end_date?: string;
};

// token 無效(常見:誤帶 "Bearer " 前綴)
export class FinMindAuthError extends Error {}
// free 方案打到 Sponsor 限定查詢(如不帶 data_id 的全市場按日查詢)
export class FinMindLevelError extends Error {}
// 600 calls/hr 限流,退避重試仍失敗
export class FinMindRateLimitError extends Error {}
```

`lib/finmind/client.ts`:

```ts
import {
  FinMindAuthError,
  FinMindLevelError,
  FinMindRateLimitError,
  type FinMindParams,
} from "./types";

const BASE_URL = "https://api.finmindtrade.com/api/v4/data";
export const FINMIND_CALLS_PER_HOUR = 600; // Free 方案實測配額;升 Sponsor 改 6000

export type FinMindDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  token?: string;
  callsPerHour?: number;
};

export type FinMindClient = {
  fetchDataset<T = unknown>(params: FinMindParams): Promise<T[]>;
};

type FinMindBody = { msg?: string; status?: number; data?: unknown } | null;

export function createFinMindClient(deps: FinMindDeps = {}): FinMindClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  // FinMind 的 token 參數只吃純 JWT;誤帶 Authorization header 的前綴會 400
  const token = (deps.token ?? process.env.FINMIND_TOKEN ?? "").replace(/^\s*Bearer\s+/i, "").trim();
  const minIntervalMs = 3_600_000 / (deps.callsPerHour ?? FINMIND_CALLS_PER_HOUR);
  let nextAllowedAt = 0;

  async function once<T>(params: FinMindParams): Promise<{ rateLimited: true } | { rateLimited: false; data: T[] }> {
    const wait = nextAllowedAt - now();
    if (wait > 0) await sleep(wait);
    nextAllowedAt = now() + minIntervalMs;

    const qs = new URLSearchParams({ dataset: params.dataset });
    if (params.data_id) qs.set("data_id", params.data_id);
    if (params.start_date) qs.set("start_date", params.start_date);
    if (params.end_date) qs.set("end_date", params.end_date);
    if (token) qs.set("token", token);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetchImpl(`${BASE_URL}?${qs}`, { signal: controller.signal });
      const body = (await res.json().catch(() => null)) as FinMindBody;
      const msg = body?.msg ?? "";
      if (res.status === 402 || /upper limit/i.test(msg)) return { rateLimited: true };
      if (/token is illegal/i.test(msg))
        throw new FinMindAuthError(`FinMind token 無效(檢查是否誤帶 "Bearer " 前綴):${msg}`);
      if (/your level/i.test(msg))
        throw new FinMindLevelError(`FinMind 等級不足(該查詢為 Sponsor 限定):${msg}`);
      if (!res.ok || body?.status !== 200) throw new Error(`FinMind failed: HTTP ${res.status} ${msg}`);
      return { rateLimited: false, data: Array.isArray(body?.data) ? (body.data as T[]) : [] };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async fetchDataset<T = unknown>(params: FinMindParams): Promise<T[]> {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const r = await once<T>(params);
        if (!r.rateLimited) return r.data;
        if (attempt < MAX_ATTEMPTS - 1) await sleep(60_000);
      }
      throw new FinMindRateLimitError("FinMind 限流:退避重試 3 次仍失敗");
    },
  };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run lib/finmind` → PASS;`pnpm test` 全綠;`pnpm exec tsc --noEmit` 無錯。

- [ ] **Step 5: Commit**

```bash
git add lib/finmind
git commit -m "feat: FinMind client 層——節流(600/hr)、限流退避、錯誤分類(token/等級/限流)、Bearer 前綴防呆"
```

---

### Task 2: FinMind dataset 封裝(日線 + 股票宇宙)

**Files:**
- Create: `lib/finmind/datasets.ts`
- Test: `lib/finmind/__tests__/datasets.test.ts`

**Interfaces:**
- Consumes: `FinMindClient`(Task 1)。
- Produces:
  - `FinMindPriceRow = { date: string; open: number; high: number; low: number; close: number; volume: number }`
  - `parseStockPrice(raw: unknown[]): FinMindPriceRow[]`;`getStockPrice(client, symbol, startDate, endDate): Promise<FinMindPriceRow[]>`
  - `FinMindStockInfo = { symbol: string; name: string; market: "TSE" | "OTC"; industry: string | null }`
  - `parseStockInfo(raw: unknown[]): FinMindStockInfo[]`;`getStockInfo(client): Promise<FinMindStockInfo[]>`

- [ ] **Step 1: 寫失敗測試**

`lib/finmind/__tests__/datasets.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { parseStockPrice, parseStockInfo, getStockPrice, getStockInfo } from "@/lib/finmind/datasets";
import type { FinMindClient } from "@/lib/finmind/client";

const priceRaw = [
  { date: "2026-07-01", stock_id: "2330", Trading_Volume: 37544470, Trading_money: 93600076825, open: 2495.0, max: 2505.0, min: 2475.0, close: 2505.0, spread: 95.0, Trading_turnover: 111091 },
  { date: "2026-07-02", stock_id: "2330", Trading_Volume: 0, open: 0, max: 0, min: 0, close: 0 }, // 停牌日:close 0 → 略過
];

describe("parseStockPrice", () => {
  it("欄位對映 max→high/min→low/Trading_Volume→volume,略過 close ≤ 0 的列", () => {
    const rows = parseStockPrice(priceRaw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ date: "2026-07-01", open: 2495, high: 2505, low: 2475, close: 2505, volume: 37544470 });
  });
});

const infoRaw = [
  { industry_category: "半導體業", stock_id: "2330", stock_name: "台積電", type: "twse", date: "2020-06-03" },
  { industry_category: "電子工業", stock_id: "2330", stock_name: "台積電", type: "twse", date: "2020-06-03" }, // 重複列:一股多產業
  { industry_category: "光電業", stock_id: "3629", stock_name: "地心引力", type: "tpex", date: "2020-06-03" },
  { industry_category: "ETF", stock_id: "0050", stock_name: "元大台灣50", type: "twse", date: "2020-06-03" },
  { industry_category: "ETF", stock_id: "00878", stock_name: "國泰永續高股息", type: "twse", date: "2020-06-03" },
  { industry_category: "大盤", stock_id: "TAIEX", stock_name: "加權指數", type: "twse", date: "2020-06-03" }, // 非個股 → 排除
  { industry_category: "認購權證", stock_id: "030001", stock_name: "某權證", type: "twse", date: "2020-06-03" }, // 6碼非00開頭 → 排除
  { industry_category: "", stock_id: "8069", stock_name: "元太", type: "tpex", date: "2020-06-03" }, // 空產業 → industry null
];

describe("parseStockInfo", () => {
  it("過濾:4碼數字或00開頭ETF;twse→TSE/tpex→OTC;依 stock_id 去重取第一列;空產業→null", () => {
    const rows = parseStockInfo(infoRaw);
    const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
    expect(bySymbol.get("2330")).toEqual({ symbol: "2330", name: "台積電", market: "TSE", industry: "半導體業" });
    expect(bySymbol.get("3629")?.market).toBe("OTC");
    expect(bySymbol.get("0050")?.industry).toBe("ETF");
    expect(bySymbol.has("00878")).toBe(true);
    expect(bySymbol.has("TAIEX")).toBe(false);
    expect(bySymbol.has("030001")).toBe(false);
    expect(bySymbol.get("8069")?.industry).toBeNull();
    expect(rows.filter((r) => r.symbol === "2330")).toHaveLength(1);
  });
});

describe("dataset wrappers", () => {
  it("getStockPrice 帶正確參數呼叫 client", async () => {
    const fetchDataset = vi.fn(async () => priceRaw);
    const client = { fetchDataset } as unknown as FinMindClient;
    const rows = await getStockPrice(client, "2330", "2021-07-01", "2026-07-08");
    expect(fetchDataset).toHaveBeenCalledWith({ dataset: "TaiwanStockPrice", data_id: "2330", start_date: "2021-07-01", end_date: "2026-07-08" });
    expect(rows).toHaveLength(1);
  });

  it("getStockInfo 不帶 data_id", async () => {
    const fetchDataset = vi.fn(async () => infoRaw);
    const client = { fetchDataset } as unknown as FinMindClient;
    const rows = await getStockInfo(client);
    expect(fetchDataset).toHaveBeenCalledWith({ dataset: "TaiwanStockInfo" });
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run lib/finmind` → FAIL(datasets 模組不存在)

- [ ] **Step 3: 實作**

`lib/finmind/datasets.ts`:

```ts
import type { FinMindClient } from "./client";

export type FinMindPriceRow = {
  date: string; // ISO YYYY-MM-DD
  open: number; high: number; low: number; close: number;
  volume: number; // 股
};

type RawPrice = { date?: string; open?: number; max?: number; min?: number; close?: number; Trading_Volume?: number };

export function parseStockPrice(raw: unknown[]): FinMindPriceRow[] {
  const out: FinMindPriceRow[] = [];
  for (const r of raw as RawPrice[]) {
    const close = Number(r.close);
    const date = r.date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue; // 停牌/無效列
    out.push({
      date,
      open: Number(r.open) > 0 ? Number(r.open) : close,
      high: Number(r.max) > 0 ? Number(r.max) : close,
      low: Number(r.min) > 0 ? Number(r.min) : close,
      close,
      volume: Number.isFinite(Number(r.Trading_Volume)) ? Number(r.Trading_Volume) : 0,
    });
  }
  return out;
}

export async function getStockPrice(
  client: FinMindClient, symbol: string, startDate: string, endDate: string,
): Promise<FinMindPriceRow[]> {
  const raw = await client.fetchDataset({ dataset: "TaiwanStockPrice", data_id: symbol, start_date: startDate, end_date: endDate });
  return parseStockPrice(raw);
}

export type FinMindStockInfo = {
  symbol: string; name: string;
  market: "TSE" | "OTC";
  industry: string | null;
};

type RawInfo = { industry_category?: string; stock_id?: string; stock_name?: string; type?: string };

// 4 碼數字(普通股與 0050 類 ETF)或 00 開頭 5–6 碼(ETF);排除權證/指數等其他代號
const SYMBOL_RE = /^(\d{4}|00\d{3,4})$/;

export function parseStockInfo(raw: unknown[]): FinMindStockInfo[] {
  const seen = new Set<string>();
  const out: FinMindStockInfo[] = [];
  for (const r of raw as RawInfo[]) {
    const symbol = (r.stock_id ?? "").trim();
    const type = r.type;
    if (!SYMBOL_RE.test(symbol) || (type !== "twse" && type !== "tpex") || seen.has(symbol)) continue;
    seen.add(symbol);
    const industry = (r.industry_category ?? "").trim();
    out.push({
      symbol,
      name: (r.stock_name ?? "").trim(),
      market: type === "twse" ? "TSE" : "OTC",
      industry: industry || null,
    });
  }
  return out;
}

export async function getStockInfo(client: FinMindClient): Promise<FinMindStockInfo[]> {
  const raw = await client.fetchDataset({ dataset: "TaiwanStockInfo" });
  return parseStockInfo(raw);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run lib/finmind` → PASS;`pnpm test`;`pnpm exec tsc --noEmit`。

- [ ] **Step 5: Commit**

```bash
git add lib/finmind
git commit -m "feat: FinMind dataset 封裝——日線(欄位對映/停牌列過濾)與股票宇宙(代號過濾/去重/市場別)"
```

---

### Task 3: TPEX 上櫃每日行情源

**Files:**
- Modify: `lib/ingest/twseOpenApi.ts`(把 `rocToIso`、`num` 加 export,供 tpexOpenApi 重用;行為不變)
- Create: `lib/ingest/tpexOpenApi.ts`
- Test: `lib/ingest/__tests__/tpexOpenApi.test.ts`

**Interfaces:**
- Produces:
  - `TpexDailyRow = { symbol: string; name: string; open: number; high: number; low: number; close: number; volume: number; date: string | null }`(shape 同 `DailyRow` 少 `change`)
  - `parseTpexDaily(json: unknown): TpexDailyRow[]`;`fetchTpexDaily(fetchImpl?): Promise<TpexDailyRow[]>`

- [ ] **Step 1: 寫失敗測試**

`lib/ingest/__tests__/tpexOpenApi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTpexDaily } from "@/lib/ingest/tpexOpenApi";

const sample = [
  {
    Date: "1150708", SecuritiesCompanyCode: "5483", CompanyName: "中美晶",
    Close: "168.50", Change: "1.50", Open: "167.00", High: "169.00", Low: "166.50",
    Average: "167.80", TradingShares: "3,251,000", TransactionAmount: "545,618,000", TransactionNumber: "2,100",
  },
  { Date: "1150708", SecuritiesCompanyCode: "707771", CompanyName: "某權證", Close: "0.55", Open: "0.5", High: "0.6", Low: "0.5", TradingShares: "10,000" }, // 權證代號 → 排除
  { Date: "1150708", SecuritiesCompanyCode: "8069", CompanyName: "元太", Close: "---", Open: "---", High: "---", Low: "---", TradingShares: "0" }, // 無成交 → 排除
];

describe("parseTpexDaily", () => {
  it("解析上櫃列:代號過濾(4碼/00開頭)、千分位、民國日期轉 ISO", () => {
    const rows = parseTpexDaily(sample);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: "5483", name: "中美晶", close: 168.5, open: 167, high: 169, low: 166.5 });
    expect(rows[0].volume).toBe(3251000);
    expect(rows[0].date).toBe("2026-07-08");
  });
  it("非陣列輸入回 []", () => {
    expect(parseTpexDaily(null)).toEqual([]);
    expect(parseTpexDaily({})).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run lib/ingest` → FAIL

- [ ] **Step 3: 實作**

`lib/ingest/twseOpenApi.ts`:把既有 `function rocToIso` 與 `function num` 改為 `export function`(內容不動)。

`lib/ingest/tpexOpenApi.ts`:

```ts
import { rocToIso, num } from "./twseOpenApi";

export type TpexDailyRow = {
  symbol: string; name: string;
  open: number; high: number; low: number; close: number;
  volume: number;          // 股
  date: string | null;     // ISO 資料日期
};

type Raw = Record<string, string>;

// 4 碼數字(普通股與 ETF)或 00 開頭(ETF);排除權證等長代號
const SYMBOL_RE = /^(\d{4}|00\d{3,4})$/;

export function parseTpexDaily(json: unknown): TpexDailyRow[] {
  const arr = Array.isArray(json) ? (json as Raw[]) : [];
  const out: TpexDailyRow[] = [];
  for (const r of arr) {
    const symbol = (r.SecuritiesCompanyCode ?? "").trim();
    const close = num(r.Close);
    if (!SYMBOL_RE.test(symbol) || close == null) continue; // 權證/指數/無成交列跳過
    out.push({
      symbol,
      name: (r.CompanyName ?? "").trim(),
      open: num(r.Open) ?? close,
      high: num(r.High) ?? close,
      low: num(r.Low) ?? close,
      close,
      volume: num(r.TradingShares) ?? 0,
      date: rocToIso(r.Date),
    });
  }
  return out;
}

export async function fetchTpexDaily(fetchImpl: typeof fetch = fetch): Promise<TpexDailyRow[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`TPEX OpenAPI failed: ${res.status}`);
    return parseTpexDaily(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
```

注意:`num("---")` 既有實作只處理 `"-"`/`"--"`,要把 `"---"` 也視為 null —— 修改 `twseOpenApi.ts` 的 `num`:`cleaned === "-" || cleaned === ""` 改為 `/^-{1,3}$/.test(cleaned) || cleaned === ""`,並在 `twseOpenApi.test.ts` 加一個 case(`num` 經由 parse 測:`ClosingPrice: "---"` 的列被略過)。

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run lib/ingest` → PASS;`pnpm test`;`pnpm exec tsc --noEmit`。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest
git commit -m "feat: TPEX 上櫃每日行情源——代號過濾/千分位/民國日期,重用 twseOpenApi 工具函式"
```

---

### Task 4: 回填決策純函式

**Files:**
- Create: `lib/ingest/backfillPlan.ts`
- Test: `lib/ingest/__tests__/backfillPlan.test.ts`

**Interfaces:**
- Produces:
  - `shouldSkipSymbol(earliest: Date | null, targetStart: Date, toleranceDays = 30): boolean` —— 斷點續跑判定
  - `chunk<T>(arr: T[], size: number): T[][]` —— createMany 分批

- [ ] **Step 1: 寫失敗測試**

`lib/ingest/__tests__/backfillPlan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldSkipSymbol, chunk } from "@/lib/ingest/backfillPlan";

const target = new Date("2021-07-01T00:00:00Z");

describe("shouldSkipSymbol", () => {
  it("DB 無資料 → 不跳過", () => {
    expect(shouldSkipSymbol(null, target)).toBe(false);
  });
  it("既有最早日早於目標起日 → 跳過(已回填過)", () => {
    expect(shouldSkipSymbol(new Date("2021-06-01T00:00:00Z"), target)).toBe(true);
  });
  it("既有最早日在目標起日 30 天容忍內 → 跳過(如上市未滿 5 年的股票)", () => {
    expect(shouldSkipSymbol(new Date("2021-07-20T00:00:00Z"), target)).toBe(true);
  });
  it("既有最早日太晚(只有每日 ingest 的淺歷史)→ 不跳過", () => {
    expect(shouldSkipSymbol(new Date("2026-07-01T00:00:00Z"), target)).toBe(false);
  });
});

describe("chunk", () => {
  it("分批與餘數", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
```

註:「上市未滿 5 年」的股票 FinMind 只會回上市後的資料,最早日=掛牌日;容忍 30 天避免每次重跑都重抓。**但掛牌日晚於目標起日+30 天的股票(如去年才上市)每次重跑會重抓一次**——可接受(資料量小、skipDuplicates 冪等),不為此加狀態表(YAGNI)。

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run lib/ingest` → FAIL

- [ ] **Step 3: 實作**

`lib/ingest/backfillPlan.ts`:

```ts
// 斷點續跑:該檔 DB 內最早日線已進入目標起日的容忍窗 → 視為回填過,跳過。
// 上市未滿 N 年的股票最早日=掛牌日;掛牌日晚於容忍窗者會重抓,靠 skipDuplicates 冪等。
export function shouldSkipSymbol(earliest: Date | null, targetStart: Date, toleranceDays = 30): boolean {
  if (!earliest) return false;
  return earliest.getTime() <= targetStart.getTime() + toleranceDays * 86_400_000;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run lib/ingest` → PASS;`pnpm test`;`pnpm exec tsc --noEmit`。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest
git commit -m "feat: 回填決策純函式——斷點續跑判定與 createMany 分批"
```

---

### Task 5: 回填腳本 `backfill-finmind`

**Files:**
- Create: `scripts/backfill-finmind.ts`
- Modify: `package.json`(scripts 加 `"backfill:finmind": "tsx scripts/backfill-finmind.ts"`)
- Modify: `Dockerfile`(backfill-history 的 esbuild 區塊後,以同樣參數編 `scripts/backfill-finmind.ts` → `dist/backfill-finmind.mjs`)

**Interfaces:**
- Consumes: `createFinMindClient`(Task 1)、`getStockInfo`/`getStockPrice`(Task 2)、`shouldSkipSymbol`/`chunk`(Task 4)、`prisma`。
- Produces: CLI —— `pnpm backfill:finmind [--years=5] [--limit=N]`;`--limit` 只回填前 N 檔(smoke 測試用)。

腳本屬 IO 編排,純邏輯已在 Task 1/2/4 測過;本任務無新單元測試(與 `backfill-history.ts` 同慣例),驗證靠 Task 7 smoke run。

- [ ] **Step 1: 實作腳本**

`scripts/backfill-finmind.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { createFinMindClient } from "@/lib/finmind/client";
import { getStockInfo, getStockPrice, type FinMindStockInfo } from "@/lib/finmind/datasets";
import { shouldSkipSymbol, chunk } from "@/lib/ingest/backfillPlan";

function isoDaysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

async function upsertStocks(stocks: FinMindStockInfo[]) {
  for (const s of stocks) {
    await prisma.stock.upsert({
      where: { symbol: s.symbol },
      create: { symbol: s.symbol, name: s.name, market: s.market, industry: s.industry },
      update: { name: s.name, market: s.market, industry: s.industry },
    });
  }
}

async function main() {
  const yearsArg = process.argv.find((a) => a.startsWith("--years="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const years = Math.max(1, Number(yearsArg?.split("=")[1]) || 5);
  const limit = Number(limitArg?.split("=")[1]) || 0;

  const endIso = new Date().toISOString().slice(0, 10);
  const startIso = isoDaysAgo(years * 365);
  const targetStart = new Date(`${startIso}T00:00:00Z`);

  const client = createFinMindClient();
  const stocks = await getStockInfo(client);
  console.log(`universe: ${stocks.length} stocks(TSE+OTC),回填 ${startIso}..${endIso}`);
  await upsertStocks(stocks);

  // 斷點續跑:已有足夠深歷史的股票跳過
  const grouped = await prisma.dailyQuote.groupBy({ by: ["stockSymbol"], _min: { date: true } });
  const earliestBySymbol = new Map(grouped.map((g) => [g.stockSymbol, g._min.date]));
  let targets = stocks
    .map((s) => s.symbol)
    .filter((sym) => !shouldSkipSymbol(earliestBySymbol.get(sym) ?? null, targetStart));
  if (limit > 0) targets = targets.slice(0, limit);
  console.log(`targets: ${targets.length} symbols(其餘已回填,跳過)`);

  const failures: string[] = [];
  let rowsDone = 0;

  async function backfillOne(symbol: string, i: number, total: number) {
    const rows = await getStockPrice(client, symbol, startIso, endIso);
    for (const batch of chunk(rows, 1000)) {
      const res = await prisma.dailyQuote.createMany({
        data: batch.map((r) => ({
          stockSymbol: symbol,
          date: new Date(`${r.date}T00:00:00Z`),
          open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
        })),
        skipDuplicates: true, // 既有列(每日 ingest)不覆蓋
      });
      rowsDone += res.count;
    }
    console.log(`${i + 1}/${total} ${symbol}: ${rows.length} rows`);
  }

  for (let i = 0; i < targets.length; i++) {
    try {
      await backfillOne(targets[i], i, targets.length);
    } catch (e) {
      failures.push(targets[i]);
      console.error(`${targets[i]} failed: ${(e as Error).message}`);
    }
  }

  // 失敗檔收尾重試一輪(限流恢復後通常會過)
  const retryFailures: string[] = [];
  for (let i = 0; i < failures.length; i++) {
    try {
      await backfillOne(failures[i], i, failures.length);
    } catch (e) {
      retryFailures.push(`${failures[i]}: ${(e as Error).message}`);
    }
  }

  console.log(`done, ${rowsDone} new rows`);
  if (retryFailures.length) {
    console.error(`failures (${retryFailures.length}):\n${retryFailures.join("\n")}`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

`package.json` scripts 加:

```json
"backfill:finmind": "tsx scripts/backfill-finmind.ts",
```

`Dockerfile` 在 backfill-history 的 esbuild 區塊後加:

```dockerfile
# FinMind 全市場歷史回填(一次性);於 pod 內 `node dist/backfill-finmind.mjs` 執行,
# 需 FINMIND_TOKEN 與 DATABASE_URL。Same bundling rationale as ingest-daily above.
RUN pnpm exec esbuild scripts/backfill-finmind.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --packages=external \
      --outfile=dist/backfill-finmind.mjs
```

- [ ] **Step 2: 驗證編譯**

Run: `pnpm exec tsc --noEmit` → 無錯;`pnpm test` → 全綠;`pnpm exec esbuild scripts/backfill-finmind.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=/tmp/backfill-finmind-check.mjs` → 成功(驗 Dockerfile 那行不會炸)。

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-finmind.ts package.json Dockerfile
git commit -m "feat: FinMind 全市場 5 年日線回填腳本——斷點續跑、批次寫入、失敗收尾重試、--limit smoke 選項"
```

---

### Task 6: 每日 ingest 補上櫃 + 每月宇宙刷新

**Files:**
- Modify: `scripts/ingest-daily.ts`(整支重寫,見下)

**Interfaces:**
- Consumes: `fetchTwseDaily`(既有)、`fetchTpexDaily`(Task 3)、`createFinMindClient`/`getStockInfo`(Task 1/2)。
- Produces: CLI —— `pnpm ingest:daily`;行為:TWSE(上市)+TPEX(上櫃)雙源獨立容錯,兩源皆敗 exit 1;每月 1 日(UTC)順帶刷新股票宇宙(失敗僅警告)。

腳本屬 IO 編排(同 Task 5 慣例無新單元測試);日期歸屬邏輯改為優先用資料列自帶日期(兩個 parser 都提供 ISO date),fallback 今日 UTC 午夜 —— 與回填/既有 cron 寫入(pod UTC)一致。

- [ ] **Step 1: 重寫腳本**

`scripts/ingest-daily.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { fetchTwseDaily } from "@/lib/ingest/twseOpenApi";
import { fetchTpexDaily } from "@/lib/ingest/tpexOpenApi";
import { createFinMindClient } from "@/lib/finmind/client";
import { getStockInfo } from "@/lib/finmind/datasets";

type QuoteRow = {
  symbol: string; name: string;
  open: number; high: number; low: number; close: number; volume: number;
  date: string | null;
};

// 資料列自帶日期優先(民國轉 ISO);缺值 fallback 今日 UTC 午夜(pod 跑 UTC,與回填一致)
function quoteDate(row: QuoteRow, fallback: Date): Date {
  return row.date ? new Date(`${row.date}T00:00:00Z`) : fallback;
}

async function ingestMarket(label: string, market: "TSE" | "OTC", rows: QuoteRow[], fallback: Date) {
  for (const r of rows) {
    await prisma.stock.upsert({
      where: { symbol: r.symbol },
      create: { symbol: r.symbol, name: r.name, market },
      update: { name: r.name },
    });
    const date = quoteDate(r, fallback);
    await prisma.dailyQuote.upsert({
      where: { stockSymbol_date: { stockSymbol: r.symbol, date } },
      create: {
        stockSymbol: r.symbol, date,
        open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
      },
      update: {
        open: r.open, high: r.high, low: r.low, close: r.close, volume: BigInt(r.volume),
      },
    });
  }
  console.log(`${label}: ${rows.length} rows`);
}

async function main() {
  const fallback = new Date();
  fallback.setUTCHours(0, 0, 0, 0);

  let okSources = 0;
  try {
    await ingestMarket("TWSE(上市)", "TSE", await fetchTwseDaily(), fallback);
    okSources++;
  } catch (e) {
    console.error(`TWSE 失敗,本日上市缺口: ${(e as Error).message}`);
  }
  try {
    await ingestMarket("TPEX(上櫃)", "OTC", await fetchTpexDaily(), fallback);
    okSources++;
  } catch (e) {
    console.error(`TPEX 失敗,本日上櫃缺口: ${(e as Error).message}`);
  }
  if (okSources === 0) {
    console.error("兩源皆失敗");
    process.exitCode = 1;
  }

  // 每月 1 日刷新股票宇宙(市場別/產業別);失敗只警告,不影響行情
  if (new Date().getUTCDate() === 1) {
    try {
      const stocks = await getStockInfo(createFinMindClient());
      for (const s of stocks) {
        await prisma.stock.upsert({
          where: { symbol: s.symbol },
          create: { symbol: s.symbol, name: s.name, market: s.market, industry: s.industry },
          update: { market: s.market, industry: s.industry },
        });
      }
      console.log(`universe refreshed: ${stocks.length} stocks`);
    } catch (e) {
      console.error(`universe refresh 失敗(下月再試): ${(e as Error).message}`);
    }
  }

  console.log("ingest done");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

注意:上櫃股票的 `market` 只在 `create` 時寫入、`update` 只更新 `name` —— 避免每日 ingest 覆寫宇宙刷新寫入的 industry;market 修正交給每月宇宙刷新(它的 update 會寫 market/industry)。

- [ ] **Step 2: 驗證**

Run: `pnpm exec tsc --noEmit`;`pnpm test`;`pnpm exec esbuild scripts/ingest-daily.ts --bundle --platform=node --format=esm --target=node22 --packages=external --outfile=/tmp/ingest-daily-check.mjs` → 皆成功。

- [ ] **Step 3: Commit**

```bash
git add scripts/ingest-daily.ts
git commit -m "feat: 每日 ingest 補上櫃(TPEX)——雙源獨立容錯、資料列日期優先、每月 1 日宇宙刷新"
```

---

### Task 7: 全量驗證 + smoke + 文件

**Files:**
- Modify: `CLAUDE.md`(指令加 `pnpm backfill:finmind`;架構節加 FinMind client 層一句;免費資料源句更新)
- Modify: `README.md`(若「資料源」節提及僅上市/FinMind 未用,同步一句;不大改)

- [ ] **Step 1: 全量驗證**

```bash
pnpm test && pnpm exec tsc --noEmit && pnpm build
```
Expected: 測試全綠(168 + 新增)、tsc 無錯、build 成功。

- [ ] **Step 2: Smoke(需 .env 的 DATABASE_URL 與 FINMIND_TOKEN 可用)**

```bash
pnpm backfill:finmind --limit=3
```
Expected: `universe: ~2000+ stocks`、3 檔各 ~1200 rows、`done, N new rows`、exit 0。
再跑一次同指令 → 3 檔被跳過或 `0 new rows`(斷點續跑 + skipDuplicates 冪等)。
接著 `pnpm ingest:daily` → TWSE/TPEX 兩行 rows 數、exit 0(驗上櫃寫入)。

- [ ] **Step 3: 文件更新**

CLAUDE.md:指令區塊加一行 `pnpm backfill:finmind   # FinMind 全市場 5 年日線回填(--years/--limit;需 FINMIND_TOKEN+DB)`;
架構區塊加 bullet:`**FinMind client 層** lib/finmind/:節流(600 calls/hr)/限流退避/錯誤分類,只走 script/cron 路徑不進使用者請求;每日 ingest 為 TWSE(上市)+TPEX(上櫃)雙源獨立容錯`。
「免費資料源」句改為:`免費資料源:MIS(盤中)、證交所/櫃買 OpenAPI(每日)、FinMind(歷史回填/宇宙/除權息,FINMIND_TOKEN)`。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: M1 FinMind 回填與上櫃 ingest 落地——指令/架構/資料源說明更新"
```
