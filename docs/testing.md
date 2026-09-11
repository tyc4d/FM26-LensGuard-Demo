# NVIDIA model selection and English demo — 2026-09-11

- The English web demo offers only Nemotron Nano VL 8B (default) and Cosmos Reason1 7B. A page keeps its own selection; Guard ON/OFF share a frozen model, image, and request. The selector is locked during comparison, and both backend and frontend reject a response from another model.
- The new host gateway reuses the prepared model environments and pinned Prototype `49aba429147c26a61ff4c9f5e44042526939b3ad`. It owns one worker at a time, releases it before switching, rejects concurrent requests, and preserves GPU ownership through client cancellation. Unit tests cover startup/load failure, timeout, mismatch, missing environments, invalid selections, and retry without substitution.
- Backend: **134 passed**. Browser suite: **66 passed** using isolated Mock/test-response services; after correcting a TypeScript check in the new test fixture, the **6 model-selection tests passed again**. Docker backend/frontend builds, TypeScript/Vite, systemd unit validation, and Git whitespace checks passed. Selector layout was checked at 320 and 1280 pixels.
- Real RTX 4090 verification first switched Nemotron → Cosmos through the gateway. Both returned HTTP 200 with their expected NVIDIA model profiles; the Nemotron guarded answer was `right`, while Cosmos classified the synthetic `EXIT → RIGHT` sign as an instruction and reported insufficient evidence. This checks switching and actual inference, not perception accuracy.
- The updated user service and Docker live stack then handled four requests from Chromium over trusted HTTPS, switching Cosmos → Nemotron. All four responses reported the requested model. Cosmos Guard ON completed with insufficient evidence (about 2.93 s inference), and Guard OFF completed with a direction proposal (0.81 s). Nemotron Guard ON answered `right` (3.38 s); its Guard OFF response was malformed JSON and correctly ended with `model_output_parse_failed`, null action, and null outcome. These results are retained as observed failures/uncertainty, with no fabricated substitute or cross-model fallback.
- The four saved GPU responses were replayed unchanged to verify the comparison display, including the unavailable Nemotron baseline alongside the successful guarded answer. Chromium reported no page errors and a secure context; both containers are healthy and the managed gateway is ready with Nemotron loaded. All 81 checked local documentation links resolve.
- Startup uses the [NVIDIA gateway guide](nvidia-demo.md). The frontend remains English; original user/model/parser content is preserved. Model environments, cached weights, Prototype policy, and external-action simulation are unchanged.

# Minimal four-state presentation — 2026-09-05

## 2026-09-06：精簡模型與 VRAM 資訊

- 標題下方加入 10px 模型／GPU VRAM 資訊，沿用每 4 秒的 health 輪詢。顯示已使用／總容量 GiB；Mock、離線或缺少讀值顯示 `—`，模型未載入／載入中有明確標示。
- Prototype `eb2b0130c05bce18d6da4657efb81c923cfc1004` 的 health 新增 `model_id` 與即時 `gpu_memory`。以 `nvidia-smi` 讀取整張 GPU 的用量，逾時上限 1 秒；不載入模型、不執行推論 preflight，舊 `gpu` 快照仍保留。
- Prototype runtime CPU 測試 **68 passed**；TypeScript／Vite build 通過；模型資訊與四階段流程的瀏覽器測試 **20 passed**，涵蓋輪詢更新、斷線後隱藏舊讀值、恢復連線、Mock／載入狀態與 320px 手機排版。
- 已更新 frontend 容器並檢查部署後的 HTTPS 頁面；桌面／手機標題可完整顯示，無 page error。預覽已載入模型的排版使用明確的 health fixture；真實 GPU 讀值檢查未載入模型。
- 部署時既有 Prototype 服務為停止狀態，頁面如實顯示「模型離線／GPU VRAM —」。本次未啟動或載入模型；Demo backend 維持原容器。

## 2026-09-06：GitHub submodule 與完整模型來源

- `prototype` 從 `120000` symlink 改為 `160000` gitlink；`.gitmodules` 使用 Prototype 的 GitHub HTTPS URL，固定於 `855630ed409ff4e71c2c30d21f1ba0d241c9c450`。GitHub 可由檔案列表前往對應 repo commit。
- 在暫存 repo 套用待提交修改後，實測全新 `git clone --recurse-submodules`，以及舊 symlink checkout 的 `git pull --ff-only` 加 `git submodule update --init --recursive`。兩條路徑皆從 GitHub 取得固定版本、工作樹乾淨且 runtime 入口存在；舊 checkout 相鄰目錄的本機檔案保留。
- README、workspace、模型安裝及維運文件已改為 submodule 流程。49 個文件相對連結與 Prototype GitHub 路徑核對通過，Git whitespace 檢查通過；Docker context 繼續排除 `prototype`。
- 第三方清單補齊 Qwen3-VL 8B、Gemma 3 4B、MiniCPM-V 4.5、OpenAI `gpt-5.6-sol`、Gemini `gemini-3.1-flash-lite`，以及 OpenAI／Google Gen AI Python SDK。模型名稱依 Prototype 報告與 manifest 核對，授權與服務條款連至官方來源；註明目前 Demo 與研究用途。
- 本次修改限 repo 連結及文件，未重跑模型推論、應用程式測試或部署；下方舊 symlink 紀錄保留為歷史，連結方式以上述 submodule 為準。

## 2026-09-06：黑客松 README 與 repo 連結

- README 依繳交格式排列十個章節，提供 Mock 重現步驟、真實 Qwen 安裝文件、Mermaid 架構圖、第三方來源與 MIT LICENSE。團隊、評選影片、公開網址與 Sponsor 資訊仍待提供。
- `prototype -> ../FM26-LensGuard-Prototype` 以 Git symlink 模式 `120000` 提交；模型原始碼保留在獨立 repo，Docker context 排除此連結。
- Prototype 驗證版本：[`855630ed409ff4e71c2c30d21f1ba0d241c9c450`](https://github.com/tyc4d/FM26-LensGuard-Prototype/commit/855630ed409ff4e71c2c30d21f1ba0d241c9c450)，分支 `phase3-direct-physical-pilot-v1`。symlink 本身不會鎖定或下載此版本。
- Prototype 相關 CPU 測試 **165 passed**：任務引用、感知、語意規則、HTTP 服務、記憶體回收、實體推論與評分工具；沒有載入 GPU 模型或提交實體資料。
- Demo 後端 **100 passed**；前端 TypeScript／Vite build 通過；`PLAYWRIGHT_ISOLATED=true npm test` **51 passed**。瀏覽器測試使用獨立 18000／15173 服務、Mock 與明確攔截的 Prototype 回應，未呼叫真實模型。
- README 章節順序、文件相對連結、symlink 目標、Docker Compose 設定、systemd unit 語法與 Git whitespace 檢查通過。
- 既有模型 health 為 `ready`，本次沒有重新部署或重啟正式服務。新主機模型安裝文件依現有環境版本整理，尚未在另一台全新 GPU 主機驗證。
- 本次 `reviewed_prototype_v1` 原始／衍生資料含辨識出的聯絡資訊，完整保留本機並加入 Git 忽略；公開提交包含工具與合成測試。

The current UI replaces the cinematic/pipeline interfaces described in the historical records below. See [presentation validation](presentation.md) for the current flow, controls, real-backend checks, and reproduction commands. DECIDE now labels useful information and rejected instructions and compares actual Guard ON/OFF results. The current validation also covers long OCR and mobile phone-number visibility.

# 桌面版排版修正驗證 — 2026-09-05

- 重現 1280×720、1366×768 下固定舞台最小高度造成的相機／按鈕裁切與控制列超出視窗；原有大尺寸檢查未涵蓋這個問題。舞台改為取得視窗剩餘高度，各幕主內容、前幕縮圖／關鍵值與頁尾分列配置，移除百分比絕對定位與語意區塊的固定空白。
- 矮桌面視窗使用較緊湊的標題、相機操作、提案與授權欄位；四參數訂位與資料不完整的錯誤說明仍完整呈現。提案幕的授權提問放在閘門同一欄，避免被內層捲動區裁切。低於 620px 的桌面高度保留捲動與底部控制；手機工具列保留換行。
- 新增 `frontend/tests/desktop-layout.spec.ts` 的 **9 項回歸測試**：1280×720、1366×768、1440×900 各跑 BLOCK／ALLOW／FAILED 全流程，檢查內容相交、所有祖先的 overflow 裁切、四個參數可見、按鈕 hit testing 與控制列位置。測試先重現原版失敗，再確認修正後全數通過。
- `PLAYWRIGHT_ISOLATED=true npm test`：**85 項全部通過**（53 項瀏覽器、32 項狀態／轉接測試）。使用獨立測試服務與明確的測試回應。原有終幕動畫、暫停、鍵盤、比較、相機、上傳與詳細資料檢查均通過。Docker 前端建置（TypeScript + Vite）通過；專案沒有獨立 lint 指令。
- Docker 前端更新後，透過可信任 HTTPS 在 1280×720、1366×768、1440×900、1920×1080 逐幕重播先前取得的真實 BLOCK／ALLOW 回應。8 組檢查均無水平溢出、主內容裁切或控制列超出視窗，原始模型輸出完整保留在抽屜；無 page error／console error。這次重播只驗證排版，未再次執行模型推論。
- 只部署前端容器；正式後端健康資訊仍為 `prototype`／`qwen3vl-8b`／ready，模型服務 PID 維持 `321864`。本次修改未新增假 OCR、權限或判定資料，也未變更模型執行環境及 API。

# 劇場式逐幕展示驗證 — 2026-09-05

- 前端改為獨立的展示狀態機：觀察、讀取、追溯、提案／授權、結果。相機與關鍵值保留跨幕位置變化；完整技術資料移入原生 dialog 抽屜。Gemma／Qwen／MiniCPM 模型、後端 API、推論與基準測試程式未修改。
- `PLAYWRIGHT_ISOLATED=true npm test`：**76 項全部通過**（44 項瀏覽器案例、32 項狀態機／資料轉接案例）。測試使用獨立 15173／18000 服務、後端模擬情境與明確攔截的 Prototype 回應，不觸碰正式模型。覆蓋原有相機／圖片／請求／連線恢復，以及鍵盤暫停、晚到 SSE、減少動態效果、失敗處理、固定 JPEG／請求的比較與不重送 POST 的重播。
- 1440×900、1920×1080 的模擬 BLOCK／ALLOW 各幕已實際逐幕檢查；主舞台與播放控制可同時在投影畫面中顯示。修正舊全域樣式的載入順序與工具列尺寸，保留手機無水平溢出的檢查。
- 真實模型未提供獨立 OCR／區域語意對應時，展示清楚標示缺口；不補上區域、信心值、權限或成功結果。模擬模式需明確設定；有資料的重播只保留本次頁面記憶體中的原始結果，重設或重載後清除。所有既有外部行動仍為模擬。
- 終幕的單次動畫由狀態機與原生 `animationend` 收尾；另以瀏覽器檢查真正的動畫執行、自然結束與中途暫停。手動切幕時相機／關鍵值直接定位，避免快速切換時文字暫時被裁切；減少動態效果模式保留完整靜態結果。
- `npm run build` 與 Docker 前端映像建置通過。只重建／更新前端容器；既有後端與 Prototype 模型服務未重啟，模型 PID 維持 `321864`。HTTPS 憑證驗證保持啟用，兩個 Docker 容器均健康。
- 真實 Chromium → HTTPS nginx → Demo → Qwen3-VL 8B 推論：訂位 `run_78b50474f3184578` 得到 `BLOCKED`，規則 `DEMO_UNSUPPORTED_POLICY_V1`，推論約 **1.73 秒**；名片明確授權 `run_f84425f35ea541cd` 得到 `ALLOWED`，規則 `DEMO_SCOPED_CARD_CALL_DELEGATION_V1`，推論約 **0.83 秒**。這是實際授權整合驗證，不是攻擊成功率實驗；兩者 `attack_success=null`、`simulation_only=true`，未採取外部行動。
- 兩次真實回應的原始模型輸出在抽屜中完整一致，`regions=[]` 未被補上假框選。實際瀏覽器 secure context 為 true，無 page error／console error；另用這兩份已取得的回應逐幕重播檢查桌面與手機畫面，未重新執行模型。
- 未設定獨立 lint 指令；TypeScript 嚴格檢查由 `npm run build` 執行。

本次修改範圍：

- 展示入口與狀態：`frontend/src/App.tsx`、`main.tsx`、`story.ts`、`usePresentation.ts`、`useComparison.ts`、`useDemoRuntime.ts`、`story.css`、`presentation-shell.css`。
- 展示元件：`frontend/src/components/story/DemoStage.tsx`、`PipelineProgress.tsx`、`PresenterControls.tsx`、`DetailsDrawer.tsx`、`details-drawer.css`；既有 `CameraPanel.tsx`、`camera.css`、`RunSummary.tsx`。
- 測試：`frontend/playwright.config.ts`；`frontend/tests/` 中的 `camera.spec.ts`、`cinematic.spec.ts`、`comparison-state.spec.ts`、`demo.spec.ts`、`real-runtime.spec.ts`、`reservation-details.spec.ts`、`story-state.spec.ts`、`transport.spec.ts`、`upload.spec.ts`、`user-request.spec.ts`、`presentation-helpers.ts`。
- 文件：`README.md`、`docs/architecture.md`、本驗證紀錄。

# 繁體中文介面驗證 — 2026-09-05

- 即時展示、評估、系統架構、相機操作、授權結果、欄位名稱、事件與耗時標籤已改為繁體中文；HTML 語言為 `zh-Hant`。模型原文、原始 JSON、識別碼與使用者請求保持不變。
- **76 個後端測試通過**，包括中文授權說明、原始政策文字保留，以及上游服務錯誤的中文提示與原始診斷。
- **38 個瀏覽器案例全部驗證通過**：首次執行通過 36 個，另 2 個受編輯期間的 Vite 熱更新干擾，trace 確認重新載入元件中斷當次狀態；停止編輯後針對該 2 個案例重跑，均通過。新增至既有案例的手機診斷展開檢查也通過。
- Docker 前後端映像建置、TypeScript／Vite、容器健康與可信任 HTTPS 檢查通過。已部署中文介面，未重啟或修改 Prototype 模型服務。
- 真實 HTTPS 瀏覽器推論 `run_8617cb9076364c9c` 使用 Qwen3-VL 8B，正確保留測試請求的日期、時間與 4 位，推論約 1.73 秒。畫面顯示「已阻擋」與中文授權說明；原始模型輸出仍完整保留，未執行外部訂位。
- 實際檢查桌面與手機的三個頁面；介面中的拉丁文字僅剩品牌、模型名稱、檔名、識別碼及模型原始值。檢查時發現長 JSON 會撐寬手機版面，已調整技術明細換行。以該真實回應重播，確認 390／1000／1600 像素下展開診斷均無水平溢出，原始文字不變；另以服務錯誤範例確認中文提示與可展開原文正常。

# Reservation details and editable request validation — 2026-09-05

- Missing reservation fields now produce `reservation_details_missing` with field-specific `validation_issues`. `N/A`, null, omitted values and known missing-value markers stay visible as model output; the Demo never substitutes time, party size or a different action. Party size requires a positive integer. Raw parser diagnostics remain expandable while the main message explains what needs correction. Invalid proposals cannot reach authorization or Guard OFF simulation.
- Real-mode reservation requests start empty and are editable. Navigation and business-card defaults are retained exactly. Submitted request text stays visible, editing clears the previous run and keeps the image, scenario drafts remain independent, and active submissions lock editing. Mock behavior remains unchanged.
- **75 Demo backend tests passed**. **38 isolated Playwright tests passed**, including new completeness, exact request submission, blank request, retry/reset, draft isolation and mobile layout regressions. These browser regressions use an isolated mock backend and intercepted Prototype responses, separate from the live service.
- Docker backend and frontend images built successfully; TypeScript/Vite passed. Both live containers are healthy after deployment. HTTPS certificate verification remained enabled. The existing live service reports Qwen3-VL 8B at revision `0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`; an independent **53-test Prototype CPU service suite passed**, including model selection and existing adapter policy behavior.
- Actual HTTPS Chromium → Docker → Prototype → Qwen smoke, without intercepted responses: run `run_c7231d00b46d42e8` sent `請替我預訂圖片中這間餐廳，2026 年 9 月 6 日晚上 7 點，4 位。` with the temporary business-card image. The model returned restaurant `ABC Bistro`, number `02-2345-6789`, time `2026-09-06 19:00`, and integer party size `4`; no schema error occurred. Inference took approximately **1.72 s**. The existing `DEMO_UNSUPPORTED_POLICY_V1` blocked reservation execution.
- The incomplete-task smoke (`run_c07943cc31084018`) exposed a model limitation: despite no requested time or people, Qwen proposed `19:00` and `2`. Those values passed completeness/type validation but remain unsupported by the trusted request; the current reservation policy blocked them. Missing `N/A` handling is established by deterministic regressions, not this model response. Completeness validation does not provide semantic grounding or guarantee extraction accuracy.
- The actual browser run had no page errors, a secure context, and no horizontal overflow at 390 px; desktop and mobile screenshots were inspected. No external reservation was made. The Prototype service was already running and was not restarted during this validation.

# Chinese direction alias validation — 2026-09-05

- Fixed the reported rejection of `向右` by adding explicit traditional/simplified Chinese aliases in the Prototype demo adapter. Canonical values are passed only to the gate; original model text and proposed values remain unchanged. Whole-value matching continues to reject uncertainty, negation, and ambiguous directions. The frozen benchmark normalizer was not edited.
- **51 Prototype service CPU tests passed**, including 24 Chinese alias cases, raw-output preservation, canonical gate values, navigation argument ordering, and rejection of ambiguous/negated phrases. The added Demo backend regression passed, verifying that a Chinese proposal reaches a terminal authorization result while retaining its displayed value.
- Restarted the idle Prototype user service. The production Python environment confirmed `向右` → `RIGHT`, `navigate.direction`, and the existing native `WARN` policy response for missing evidence. No Demo application code or image rebuild was needed.
- An additional actual HTTPS browser/model smoke with a generated right-arrow EXIT sign did **not** demonstrate correct model recognition: run `run_a6f4716d1076445c` produced `direction: "exit"`. The positive-direction assertion failed; the application correctly retained that raw output and rejected it with `model_action_invalid`. Acceptance of Chinese aliases is established by the deterministic service/bridge tests, not by that model response.

# Unusable direction and terminal authorization validation — 2026-09-05

- Reproduced the reported `direction: "未知"` failure from the live Prototype traceback: the frozen parser accepted the strings, but the action normalizer rejected the direction. This had been reported as generic policy unavailability, while the proposal panel still displayed pending authorization.
- The Prototype now separates action-value validation from unexpected policy failure. The Demo preserves raw/candidate values, terminates with `model_action_invalid`, and withholds both authorization and Guard OFF simulation. Failed valid proposals show `NOT AUTHORIZED`; invalid values show `INVALID ACTION`.
- **48 Demo backend tests** and **17 Prototype service CPU tests** passed. The isolated browser run passed 31 tests; one existing test used a hardcoded backend port, was changed to the test's same-origin API, then passed its targeted rerun. All **32 browser checks** are covered, including terminal policy failures and invalid directions with Guard ON/OFF.
- Rebuilt both Docker images, restarted the task's Prototype service while idle, and recreated the live containers. A real HTTPS Chromium navigation run against the test business-card image returned another unusable model value (`direction: "出口"`, `destination: "在哪裡"`). Run `run_e20a4b82d7c84aa6` retained that output, ended after `inference.completed` with `runtime.failed` / `model_action_invalid`, and displayed a terminal invalid action with no policy or execution. First request including load took about 4.87 s; model inference took 1.31 s. This checks error handling, not navigation accuracy.
- Docker remains in prototype mode. Model packages, frozen parser/prompt/firewall code, and semantic-grounding capabilities were not changed. Both repository diffs pass whitespace checks.

# Docker real inference validation — 2026-09-05

- Corrected the running deployment from mock to the existing Linux live override. The host's ignored root `.env` now selects `COMPOSE_FILE=docker-compose.yml:docker-compose.live.yml`, so ordinary Compose commands retain prototype mode. Base-only Compose remains available for mock tests.
- Started the existing Prototype using the checked-in `scripts/lensguard-prototype.service` user service and the verified `lensguard-vlm` environment. The unit is enabled for user login; no system-wide service or lingering was configured. GPU inspection found no competing compute process before loading. No model packages, revisions, research processes, or Prototype source files were changed.
- Verified merged Compose configuration uses backend host networking, loopback upstream port 8010, and frontend `backend:host-gateway`. Both containers are healthy. HTTPS `/api/health` reports `runtime: prototype`, `model: live`, upstream `status: ready`, and `model_loaded: true`.
- An actual Chromium browser on the server opened the Tailscale HTTPS address with certificate verification enabled, uploaded the temporary business-card test image, and ran explicit delegation through nginx → Docker backend → host Prototype → Gemma 3 4B. No requests were intercepted or replaced with fixtures.
- Run `run_347354b7c45b4a1d` completed with real raw JSON `CALL`, `target_number: 02-2345-6789`, and seven SSE events ending in `action.allowed`. The loaded model was `google/gemma-3-4b-it` at revision `093f9f388b31de276ce2de164bdc2081324b9767`. First request including load took about **4.87 s**; inference took **1.32 s**. This validates the connection and scoped demo authorization, not attack prevention or a real telephone call.
- The browser reported a secure context with no page errors or mixed content. The model remains running for the requested demo, using approximately **8,990 MiB** of GPU memory. Physical camera access and a separate visiting device were not exercised in this check.
- `systemd-analyze --user verify`, Compose configuration checks, and `git diff --check` passed.

# Docker HTTPS validation — 2026-09-05

- Reproduced the reported failure: the running frontend had `HTTPS_ENABLED=false`, and an HTTPS request failed with OpenSSL `wrong version number`. The existing certificate also omitted the Tailscale IP used by the visiting browser.
- Built the frontend Docker image successfully (TypeScript + Vite production build), regenerated the certificate with both LAN and Tailscale addresses using the existing local CA, and recreated the frontend. Both Compose services are healthy; the default frontend now uses HTTPS.
- Verified certificate chains and hostnames with curl using the public CA explicitly, without `--insecure`, on localhost, the LAN IP, and the Tailscale IP. The same-origin `/api/health` endpoint returned the mock runtime on all three addresses.
- HTTP GET/HEAD and POST requests return a **308** redirect preserving the host, external port, path, and query string. `nginx -t` and the container HTTPS healthcheck passed.
- **29 Playwright tests passed** against the running Docker frontend/backend over trusted HTTPS, including progressive SSE, same-origin API calls, synthetic camera playback, uploads, and UI flows. Real-runtime browser tests use intercepted responses; this run did not invoke the Prototype service or model.
- A separate Chromium check followed HTTP to HTTPS on the Tailscale IP, confirmed `window.isSecureContext`, played a synthetic camera stream, and reached the API without certificate bypasses, page errors, or mixed-content messages. This check ran on the server itself, not a separate physical device.
- Isolated containers verified that default/explicit HTTPS without certificates and invalid HTTPS settings fail clearly. Explicit HTTP mode without certificates passed its healthcheck and proxied the API.
- **8 certificate-helper tests passed**, covering additional IP/DNS names, option rejection, help without dependencies, and the existing generation/failure cases. Shell syntax, default/live Compose configuration, and `git diff --check` passed.

The full browser suite below expects a **mock backend**. On a test deployment, select base-only Compose with `docker compose -f docker-compose.yml up -d` before running it; the saved live override intentionally supplies real inference instead. To repeat the suite against those mock HTTPS containers, run from `frontend/`:

```bash
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" VITE_HTTPS=true npm test
```

Outside CI the Playwright configuration reuses the healthy services on ports 8000 and 5173. The browser must independently trust the same CA. Physical camera permission and CA trust on each visiting device still require checks there.

# Real local integration validation — 2026-09-05

- Prototype service and affected adapter/parser/gate regressions: **92 passed**, CPU fake-adapter suite.
- Demo backend: **35 passed**, including multipart forwarding, native decision mapping, SSE order, parse failure, timeout/unavailable, policy absence, and no mock fallback.
- HTTPS Playwright: **28 passed**, including synthetic camera-to-JPEG upload and uploaded-image-to-JPEG upload; no unsolicited POSTs.
- Production build passed (TypeScript + Vite).
- Default and Linux real-mode Compose configuration validated. The later Docker validations above now verify both mock execution and real model inference through the containers.
- Real Gemma 3 4B smoke passed: first request ~7.98 s including load, ~1.55 s inference; warmed requests ~0.95–0.98 s. Pinned revision and BF16 retained. GPU initially 15 / 24,564 MiB; resident ~9,013 MiB; peak torch allocation 8,866,027,008 bytes.
- Actual HTTPS browser → multipart → Demo → Prototype → Gemma → SSE → ALLOWED confirmed with a temporary local business-card image. Raw CALL output visible, secure context true, no mixed-content requests, no page errors, no horizontal overflow at 1600×1000.
- Real HTTP/SSE end-to-end also returned BLOCKED (native CONFIRM for missing evidence) and Guard OFF EXECUTED. These are authorization/integration checks, not proof of attack prevention.
- No active Phase 3.6 process was observed at either pre-load inspection. No existing research process was stopped, paused or modified. No model-stack versions changed. Validation-only real services were then stopped; final GPU usage was 15 MiB with 24,095 MiB reported free and no compute processes. Existing mock development servers remain available.
- Physical webcam access was **not** tested. Browser camera tests use Chromium's synthetic device. LAN devices still require trusted HTTPS certificates.

## Earlier mock/HTTPS validation

# Validation notes

Validation date: 2026-09-05.

These checks validate the UI and deterministic mock runtime. They do not measure LensGuard security efficacy or Phase 3.6 model performance.

## Recorded status

| Check | Result |
| --- | --- |
| Backend test suite | 27 tests passed |
| Frontend production build | Passed: TypeScript and Vite |
| Frontend Playwright suite, HTTP localhost (prior transport validation) | 18 tests passed |
| Frontend Playwright suite, restyled UI and image upload over trusted HTTPS localhost | 25 tests passed; browser certificate verification enabled |
| Certificate helper | 5 tests passed; real mkcert generation and LAN detection also verified |
| HTTPS LAN IP access | Secure context, synthetic camera playback, same-origin API and 7 SSE events verified |
| Docker Compose configuration | Passed in HTTP and HTTPS modes |
| nginx HTTPS configuration | Entrypoint rendering checked; native nginx served production UI, API and progressive SSE over HTTPS |
| Docker image build and container startup | Passed in the later Docker HTTPS validation above |
| Physical webcam | Requires a check on the presentation device; automated browser camera tests use synthetic media |

## Reproduce backend validation

From the repository root, after installing the backend requirements:

```bash
cd backend
source .venv/bin/activate
pytest
```

The suite covers health and scenario enumeration; deterministic outcomes for all three scenarios and guard states; progressive, timestamped snapshots; SSE replay and terminal streams; schema/input validation; provider failure; and bounded in-memory run handling.

## Reproduce frontend validation

First create `backend/.venv` and install `backend/requirements.txt` as described in the README. Then:

```bash
cd frontend
npm install
npx playwright install chromium
npm test
npm run build
```

The Playwright configuration starts FastAPI on port 8000 and Vite on port 5173. Outside CI it reuses running servers. Tests use `http://localhost:5173` and the default same-origin `/api` development proxy. The backend interpreter defaults to `backend/.venv/bin/python`; override it with `PYTHON_BINARY=/absolute/path/to/python npm test` if the installed dependencies live elsewhere.

For HTTPS, generate and trust the certificates using the README setup, stop any HTTP server on port 5173, then run from `frontend/`:

```bash
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" VITE_HTTPS=true npm test
```

The browser suite uses `https://localhost:5173` in this mode. It does not set `ignoreHTTPSErrors`, and it checks `window.isSecureContext`, same-origin API URLs, progressive SSE, and absence of mixed-content console messages. A separate browser check against the actual LAN IP also passed with certificate verification enabled. This was a LAN-address check from the same host, not a test on a physical secondary device.

For this unprivileged validation host, mkcert was built from its upstream v1.4.4 module and NSS tools were extracted locally. The test CA was installed into the user's NSS browser trust store using `TRUST_STORES=nss`; system-wide CA trust was not changed. Curl and Node verified the certificate using that public CA explicitly. Normal presentation setup uses `mkcert -install` with its supported host trust stores, as documented in the README.

Run certificate-helper tests from the repository root:

```bash
python3 scripts/test_https_setup.py
```

These tests use a stub mkcert in temporary directories and cover missing tools, explicit SAN inputs, private-key permissions, invalid/missing LAN addresses, and failed regeneration preserving existing certificates. Actual generated SANs were independently inspected with OpenSSL. Git ignores both generated PEM files.

Browser coverage includes scenario switching, guarded and unguarded results, explicit delegation, event ordering, structured action JSON, provenance traces, reset during a run, backend interruption and recovery, navigation placeholders, and viewport overflow.

The restyled Live Demo was visually reviewed at 1440×900 and 1920×1080, plus a 390px mobile width. Tests verify large visible primary controls, the distinct Chinese outcome headlines, all four technical sections being collapsed by default, their retained content after expansion, no interface emojis, and the non-attack outcome when delegation runs with the guard disabled. The 1920×1080 layout keeps the full central stage in view; expandable evidence remains below it. Camera lifecycle, HTTPS, REST, and progressive SSE tests continue to pass. No backend API contract changed for this restyling.

Seven camera tests cover actual synthetic stream playback, denied permission, a missing device, cancellation while permission is pending, preserving the stream across Reset and navigation tabs, recovery when a media track ends, and front/back selection. They use Chromium's synthetic video device; they do not establish that a particular physical webcam works.

Five upload tests cover local preview without network transfer, mock analysis and Reset/navigation retention, replacement/removal and object URL cleanup, camera/image switching, invalid/oversized/corrupt file handling, and use without a secure camera context. The image upload feature does not change the backend contract or introduce real image inference.

On Linux hosts missing browser libraries, `npx playwright install --with-deps chromium` installs the browser dependencies when system package installation is available. The test command reports missing libraries if those requirements have not been met.

## Container review

`docker compose config --quiet` and `HTTPS_ENABLED=true docker compose config --quiet` succeed. Review confirmed:

- The backend uses the repository root as its build context, copies `backend/app` and `mock-data`, and resolves its default fixture path to `/app/mock-data/scenarios.json`.
- The backend runs one Uvicorn worker as a non-root user. Its healthcheck uses the standard library and requires no additional executable.
- The frontend build has a lockfile and includes the Linux musl optional packages required by the Alpine Node image.
- Nginx serves HTTP or HTTPS on container port 8080, mapped to host port 5173. `HTTPS_ENABLED` selects the startup configuration. `/api/` preserves its path when forwarded to `backend:8000`.
- The SSE proxy disables buffering and caching and permits idle time longer than the backend heartbeat interval.
- Compose waits for backend health before starting the UI. The frontend healthcheck uses the image's BusyBox `wget` with the selected protocol. The HTTPS liveness probe skips local CA verification; browser verification is unaffected.
- Certificates mount read-only and are excluded from image build contexts. The nginx entrypoint rejects missing HTTPS certificates and invalid HTTPS mode values.
- Root and frontend `.dockerignore` rules exclude local environments, dependencies, builds, and test artifacts from their respective build contexts.

The earlier validation could not access the Docker daemon, so it used a local, unprivileged nginx 1.24 process with adapted test paths, port, and upstream hostname to verify HTTPS, API health, and progressive SSE. The Docker HTTPS validation recorded at the top of this file now verifies the actual nginx 1.28 container image and startup. No Docker socket permissions or system packages were changed for these checks.

On a host with a working Docker daemon, verify the complete container path using:

```bash
./scripts/setup-https.sh
HTTPS_ENABLED=true docker compose up --build
```

Open <https://localhost:5173>, run the three scenarios and Guard OFF comparison, and confirm the timeline updates progressively. The browser owns camera access; no container camera device mount is required. No physical camera hardware was available on this validation host.
