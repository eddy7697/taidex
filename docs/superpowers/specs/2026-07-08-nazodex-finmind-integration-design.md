# NazoDex FinMind 整合 設計

日期:2026-07-08。目標:把 FinMind Free 方案用在刀口上,為未來升級 Sponsor 鋪路。
對使用者零感知 —— 所有新資料源只在後端 ingest 路徑進 DB,前端頁面照舊讀 DB/MIS。

## Free 方案的真實邊界(2026-07-08 實測,決定了整份設計)

- 帳號:Free(level 1 "register")、email 已驗證、**600 calls/hr**(`api.web.finmindtrade.com/v2/user_info` 實測)。
- **可用**:帶 `data_id` 的逐檔查詢(TaiwanStockPrice 單檔 5 年 1,220 列 ✓、上櫃 ✓、TaiwanStockDividend ✓);`TaiwanStockInfo` 全宇宙 4,276 檔不需 data_id ✓。
- **不可用**:**不帶 `data_id` 的全市場按日查詢回 400 "Your level is register"——是 Sponsor 限定**。
  因此「每日行情 1 次呼叫拿全市場」在 free 做不到,每日 ingest 不走 FinMind(見 M1)。
- **Token 格式雷**:`token` 參數只吃純 JWT,**不可帶 `Bearer ` 前綴**(實測踩雷:帶前綴回 400 "Token is illegal")。client 層防禦性 strip。
- 環境變數:`FINMIND_TOKEN`(`.env.example` 已有;prod 進 K8s Secret,注入需要它的 Job/CronJob)。

## 資料源分工(各源做自己最擅長的事,全部實測可用)

| 資料 | 來源 | 理由 |
|---|---|---|
| 歷史日線回填(5 年、含上櫃) | **FinMind** `TaiwanStockPrice` 逐檔 | 唯一能一檔一呼叫拿整段歷史的免費源(TWSE STOCK_DAY 要逐月,慢 60 倍) |
| 股票宇宙/市場別/產業別 | **FinMind** `TaiwanStockInfo` | 1 次呼叫 4,276 檔,含 twse/tpex 與 industry_category |
| 除權息行事曆 | **FinMind** `TaiwanStockDividend` 逐檔 | 只抓持股∪自選,呼叫數個位數 |
| 每日行情(上市) | TWSE `STOCK_DAY_ALL`(現行) | 免 token、1 次全上市,已驗證多月 |
| 每日行情(上櫃) | **TPEX** `tpex_mainboard_daily_close_quotes` | 免 token、1 次全上櫃(實測 10,039 列,含權證需過濾) |
| 月營收(上市) | TWSE `t187ap05_L` | 免 token、1 次全上市 1,082 檔,**連去年同月增減% 都算好** |
| 季 EPS(上市) | TWSE `t187ap14_L` | 免 token、1 次全上市,含「基本每股盈餘(元)」 |

FinMind free 的**真正價值 = 歷史回填 + 宇宙/產業 + 除權息**;每日與基本面用 TWSE/TPEX 免費源更省更穩。
Sponsor 升級點(見文末)才把每日行情整併回 FinMind。

## 目標

1. **M1 歷史日線回填**:全市場(上市+上櫃)× 5 年進 `DailyQuote`,立刻解鎖均線/技術指標資料基礎(不用等累積到 2026-10);每日 ingest 加 TPEX 源,上櫃從此不斷線。
2. **M2 基本面**:月營收 + 季 EPS 進 DB → 策略推薦第六因子「成長」+ 個股頁基本面區塊。
3. **M3 除權息建議卡**:比對持股 × 行事曆,`/holdings` 顯示建議卡、一鍵帶入既有交易表單。

實作順序 M1 → M2 → M3,各自獨立分支/PR、完整 TDD。

## 架構總則:`lib/finmind/` 唯一 FinMind 出入口

延續 quote-service「換源只動一層」哲學:

```
lib/finmind/
  client.ts    fetchDataset(dataset, params) —— token 注入(strip Bearer)、8s abort、
               節流(token-bucket,常數 FINMIND_CALLS_PER_HOUR = 600)、
               402/限流→退避重試(60s × 3 次,最終拋錯不吞)、錯誤分類(限流/token 無效/等級不足/空資料/網路)
  datasets.ts  型別化封裝:getStockPrice(symbol, start, end)、getStockInfo()、getDividends(symbol, start)
               —— 各自含純函式 parser(可單獨測)
  types.ts     FinMindRow 各型別
```

- **只走 cron/script 路徑,永不進使用者請求路徑**(600 calls/hr 對批次綽綽有餘,對線上流量太脆弱)。
- TPEX 日行情與 TWSE 基本面歸 `lib/ingest/`(與現有 `twseOpenApi.ts` 同層同模式),不進 finmind 層。

## M1:回填 + 每日 ingest 補上櫃

### 股票宇宙(`TaiwanStockInfo`,1 次呼叫)

- 保留 `type ∈ {twse, tpex}` 且代號為 4 碼數字(普通股)或 `00` 開頭(ETF);排除權證等其他代號。
- 依 stock_id 去重(原始資料一股多產業列)。
- upsert `Stock.market`(TSE/OTC)與 `Stock.industry`(產業別篩選的資料基礎,本次只回填欄位、不做 UI)。
- 執行時機:回填開始時 + 每日 ingest 每月 1 日順帶刷新。

### 回填 `scripts/backfill-finmind.ts`(`pnpm backfill:finmind`)

- 逐檔 1 次呼叫拿 5 年日線(`--years=N` 預設 5)→ upsert `DailyQuote`(schema 不動;date 存 UTC 午夜,與現有 ingest 一致)。
- 約 2,000 檔 ÷ 600 calls/hr ≈ **3.5 小時**;節流由 client 層統一負責。
- **可斷點續跑**:該檔 DB 內最早日線已早於目標起日(容忍 30 天)則跳過;失敗檔收尾重試一輪,結束輸出失敗清單。
- 跑本機(需可連 DB)或 K8s Job 皆可;一次性工作,不設 CronJob。

### 每日 ingest 改造(`scripts/ingest-daily.ts`)

- 上市:維持 TWSE `STOCK_DAY_ALL`(不動)。
- **新增上櫃**:TPEX `tpex_mainboard_daily_close_quotes`(`lib/ingest/tpexOpenApi.ts`,過濾 4 碼/`00` 開頭代號、`TradingShares→volume`),upsert `DailyQuote` + `Stock`(market=OTC)。
- 兩源獨立容錯:單源失敗只缺該市場當日資料,log 明確標示。兩個 OpenAPI 都只回最新交易日 → 補歷史洞一律用 FinMind 逐檔(回填腳本本身就是補洞工具,重跑即可)。

## M2:基本面(月營收 + EPS,全走 TWSE OpenAPI)

### DB(Prisma migration)

```
MonthlyRevenue { stockSymbol, month DateTime @db.Date(該月 1 日), revenue BigInt, yoyPct Float?, @@unique([stockSymbol, month]) }
QuarterlyEps   { stockSymbol, quarter DateTime @db.Date(該季首日), eps Float,    @@unique([stockSymbol, quarter]) }
```

`yoyPct` 直接存 t187ap05_L 的「去年同月增減(%)」(官方已算好,不自己推)。

### Ingest `scripts/ingest-fundamentals.ts`(K8s CronJob 每月 11、16 日各跑一次)

- 月營收:`t187ap05_L`(1 次呼叫全上市,民國年月轉西元)→ upsert。
- 季 EPS:`t187ap14_L`(1 次呼叫,年度/季別轉季首日)→ upsert;非公告月拿到舊季資料,upsert 冪等無害。
- 兩者皆為「最新一期」快照 → 歷史靠每月 cron 累積;**首跑無法回填 24 個月歷史**——
  成長因子上線初期 YoY 直接用 `yoyPct`(不需自家歷史),個股頁營收走勢圖隨月份累積漸豐(空狀態:「資料累積中」)。

### 策略第六因子「成長」

- 因子值 = 最新一期月營收 `yoyPct` → 截面百分位(engine.ts 既有機制;上市宇宙與現行 strategy 一致)。
- 缺值容錯沿用現制:因子 null → 權重再正規化;主因子缺值不進榜規則不變。
- 權重面板加「成長」滑桿;預設權重重分配於 plan 階段定案。
- snapshot 組裝:`getStrategySnapshot()` 從 DB 撈各股最新一期營收(一次 query),失敗 → 成長因子全 null(區塊容錯,同月均/T86 模式)。

### 個股頁基本面區塊

- `/api/stock/[symbol]/fundamentals`:近 12 月營收(+yoyPct)、近 8 季 EPS(累積多少給多少)。
- UI:營收長條圖(YoY 文字標示)+ EPS 簡表;無資料(ETF/上櫃)→ 區塊隱藏。

## M3:除權息建議卡

### DB(Prisma migration)

```
DividendEvent { stockSymbol, exDate DateTime @db.Date, kind String(CASH|STOCK),
                perShare Float(現金:元/股;股票:配股率 股/股), year String,
                @@unique([stockSymbol, exDate, kind]) }
```

現金與股票除權息日不同 → 各自一列,對映既有 `DIV_CASH`/`DIV_STOCK` 交易型別。

### Ingest `scripts/ingest-dividends.ts`(K8s CronJob 每週一次)

- 只抓**持股∪自選**的股票(FinMind 逐檔呼叫,量極小),查近 1 年 + 未來公告。

### 建議產生(純函式,`lib/holdings/dividendSuggestions.ts`)

- 對每檔有部位的持股:取 `exDate ≥ 首筆買進日` 且 `exDate ≤ 今日` 的事件(未來事件僅顯示預告、不可帶入)。
- 股數基準 = **除權息日前一日的持股股數**(由交易流水重放推得,positions 既有邏輯延伸)。
- 已記帳判定:同代號、同型別(`DIV_CASH`/`DIV_STOCK`)、交易日在 exDate ±30 天內 → 視為已記,卡片不出現。
- 建議金額:現金 = 股數 × perShare;配股 = 股數 × perShare(股);費用預設走 `fees.resolveFees`(匯費 10、健保補充費門檻既有規則)。

### UI(`/holdings`)

- 持股列表上方「除權息建議」卡片區:「2330 於 6/16 除息 4.5 元,依你持股 1,000 股應收約 4,500 元」→ 點擊開既有交易表單並預填 → 使用者確認儲存。
- 無建議時區塊不渲染。**無交易狀態機、不自動寫入任何交易。**

## 呼叫預算(FinMind Free 600 calls/hr)

| 工作 | 頻率 | FinMind 呼叫數 |
|---|---|---|
| 一次性回填 | 一次 | ~2,000(3.5 hr 內自動節流) |
| 股票宇宙刷新 | 每月 | 1 |
| 除權息 | 每週 | ≈ 持股∪自選檔數(<20) |
| 每日行情/基本面 | — | 0(走 TWSE/TPEX 免費源) |

常態消耗趨近於零,配額全部留給回填與未來功能。

## Sponsor 升級點(架構已預留,屆時不重構)

- 換 token + 調 `FINMIND_CALLS_PER_HOUR`(600 → 6000)。
- 全市場按日查詢解鎖 → 每日 ingest 可整併為 FinMind 1 次呼叫(上市+上櫃),TWSE/TPEX 降為後備。
- 新 dataset(tick、籌碼分點、融資融券、即時報價)各自加 `datasets.ts` 封裝。

## 錯誤處理

- client:限流 → 60s 退避重試 3 次 → 拋 `FinMindRateLimitError`;400 token 無效 → `FinMindAuthError`(訊息附「檢查是否帶 Bearer 前綴」);400 等級不足 → `FinMindLevelError`(明確提示該查詢是 Sponsor 限定);空資料回 `[]` 不視為錯。
- 每日 ingest:TWSE/TPEX 單源失敗只缺該市場,exit code 仍為 0 但 log 警示;兩源皆敗 → exit 1。
- 回填:單檔失敗不中斷,收尾重試 + 輸出失敗清單;限流錯誤等退避(不計入失敗)。
- 基本面/除權息 ingest 失敗:資料維持舊值,前端因子/卡片自然基於既有資料(區塊容錯哲學)。

## 測試(TDD)

- finmind client:mock fetch —— token 注入與 Bearer strip、退避、錯誤分類(含等級不足);節流器用 fake timers。
- parsers:各源純函式(欄位對映、民國/西元、季別轉換、去重、代號過濾)。
- 回填:斷點續跑判定純函式(既有最早日 vs 目標起日)。
- 策略:成長因子計分、缺值再正規化(engine 既有測試模式擴充)。
- 除權息:建議產生/已記帳判定/股數重放純函式。

## YAGNI(本輪不做)

- 盤中即時報價換 FinMind(MIS 免費夠用;Sponsor 的 tick 屬非商用限制,再議)。
- 產業別篩選 UI(本輪只回填 `Stock.industry` 資料)。
- 回測、技術指標 UI(本輪只鋪資料基礎;均線等指標另案設計)。
- 除權息自動記帳/草稿狀態機(維持建議卡 + 人工確認)。
- 上櫃進 screener/strategy(兩者快照源仍為 TWSE OpenAPI 上市宇宙,另案)。
- 上櫃月營收/EPS(`t187ap05_O`/`t187ap14_O`,等上櫃進 strategy 才有用)。
- FinMind 資料品質對帳工具(TWSE vs FinMind 交叉驗證,出問題再做)。
