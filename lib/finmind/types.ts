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
