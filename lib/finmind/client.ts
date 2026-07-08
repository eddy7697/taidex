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
