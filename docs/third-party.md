# 第三方模型、套件與素材來源

以下列出 Demo 與 Prototype 研究實際使用過的模型、雲端 API 與主要套件。
前端確切版本與完整相依樹記錄於
[`package-lock.json`](../frontend/package-lock.json)，Demo 後端版本記錄於
[`requirements.txt`](../backend/requirements.txt)，模型環境見
[本機模型安裝](local-model-setup.md)。每個套件附帶的 LICENSE／NOTICE 仍適用，
本專案的 MIT 授權不取代上游條款。

## 使用過的模型與雲端 API

目前真實 Demo 使用本機 Qwen3-VL 8B。Gemma 曾用於早期 Demo 整合；
三個 local 模型與兩個 cloud 模型均有 Prototype 實驗紀錄。
下表保留實驗的確切模型 ID，雲端名稱以已保存的執行紀錄為準。

| 類型 | 模型與確切 ID | 官方來源與授權／服務條款 | 專案用途 |
| --- | --- | --- | --- |
| Local | Qwen3-VL 8B Instruct：`Qwen/Qwen3-VL-8B-Instruct` | [模型頁，Apache-2.0](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | 目前 Demo 的場景轉錄、任務解析與引用選取；Phase 2.5／3.5 本機基準及實體 pilot |
| Local | Gemma 3 4B IT：`google/gemma-3-4b-it` | [模型頁](https://huggingface.co/google/gemma-3-4b-it)、[Gemma Terms of Use](https://ai.google.dev/gemma/terms) | 早期真實 Demo 整合；Phase 2.5／3.5 小模型基準及實體 pilot |
| Local | MiniCPM-V 4.5：`openbmb/MiniCPM-V-4_5` | [模型頁與 Apache-2.0 說明](https://huggingface.co/openbmb/MiniCPM-V-4_5#license) | Phase 2.5／3.5 本機多模態基準及實體 pilot |
| Cloud | OpenAI：`gpt-5.6-sol` | [Responses API](https://platform.openai.com/docs/api-reference/responses)、[OpenAI Services Agreement](https://openai.com/policies/services-agreement/) | Phase 3.6 雲端基準與實體 pilot；圖片、文字輸入及結構化行動／證據輸出 |
| Cloud | Google Gemini：`gemini-3.1-flash-lite` | [模型頁](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)、[Gemini API 條款](https://ai.google.dev/gemini-api/terms) | 早期 Prototype／Phase 2、Phase 3.6 雲端基準及實體 pilot；使用 Gemini Interactions API |

Local 權重由 Hugging Face 另外下載，未納入 Demo repo。Gemma 下載需先接受
Google 的模型使用條款。Cloud 模型透過 API 使用，適用各供應商服務條款；
下方 SDK 的 Apache-2.0 授權適用於 SDK 程式碼。API 金鑰保留在本機環境，
目前的 Qwen Demo 與 Mock 模式都不需要 cloud API 金鑰。

使用紀錄與版本依據：

- [Phase 2.5 本機模型與固定 revision](https://github.com/tyc4d/FM26-LensGuard-Prototype/blob/855630ed409ff4e71c2c30d21f1ba0d241c9c450/docs/phase2_5_local_vlm.md#primary-models-and-revisions)。
- [Phase 3.5 三個本機模型報告](https://github.com/tyc4d/FM26-LensGuard-Prototype/blob/855630ed409ff4e71c2c30d21f1ba0d241c9c450/results_phase3_5/grounded-provenance-v1/report_local_models.md)。
- [Phase 3.6 雲端模型與 SDK 設定](https://github.com/tyc4d/FM26-LensGuard-Prototype/blob/855630ed409ff4e71c2c30d21f1ba0d241c9c450/docs/phase3_6_cloud_provider_baseline.md#models-and-fixed-api-configuration)：OpenAI、Gemini 各完成 162 筆正式 trial。
- [實體 pilot 執行 manifest](https://github.com/tyc4d/FM26-LensGuard-Prototype/tree/855630ed409ff4e71c2c30d21f1ba0d241c9c450/results_physical_pilot/direct_v1)：用於核對實際呼叫的模型，完成與失敗數依各 provider manifest 為準。
- [Demo 測試紀錄](testing.md)保留早期 Gemma 與目前 Qwen 的真實整合驗證。

## 套件與開發服務

| 套件／服務 | 官方來源與授權 | 用途 |
| --- | --- | --- |
| React、React DOM | [MIT](https://github.com/facebook/react/blob/main/LICENSE) | 前端 UI |
| TypeScript | [Apache-2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | 型別與編譯 |
| Vite、React plugin | [Vite MIT](https://github.com/vitejs/vite/blob/main/LICENSE)、[plugin MIT](https://github.com/vitejs/vite-plugin-react/blob/main/LICENSE) | 開發伺服器與建置 |
| Tailwind CSS | [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) | 樣式工具 |
| FastAPI | [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE) | HTTP API |
| Pydantic | [MIT](https://github.com/pydantic/pydantic/blob/main/LICENSE) | 資料驗證 |
| Starlette | [BSD-3-Clause](https://github.com/Kludex/starlette/blob/main/LICENSE.md) | ASGI 與回應處理 |
| Uvicorn | [BSD-3-Clause](https://github.com/Kludex/uvicorn/blob/main/LICENSE.md) | ASGI 伺服器 |
| HTTPX | [BSD-3-Clause](https://github.com/encode/httpx/blob/master/LICENSE.md) | Prototype HTTP 串接 |
| python-dotenv | [BSD-3-Clause](https://github.com/theskumar/python-dotenv/blob/main/LICENSE) | 本機環境設定 |
| python-multipart | [Apache-2.0](https://github.com/Kludex/python-multipart/blob/master/LICENSE.txt) | 圖片 multipart 上傳 |
| PyTorch、Torchvision | [PyTorch BSD-style](https://github.com/pytorch/pytorch/blob/main/LICENSE)、[Torchvision BSD-3-Clause](https://github.com/pytorch/vision/blob/main/LICENSE) | GPU 與圖片模型執行；附帶第三方條款見各 LICENSE |
| Transformers、Accelerate | [Apache-2.0](https://github.com/huggingface/transformers/blob/main/LICENSE)、[Apache-2.0](https://github.com/huggingface/accelerate/blob/main/LICENSE) | 模型／處理器載入與推論 |
| huggingface-hub | [Apache-2.0](https://github.com/huggingface/huggingface_hub/blob/main/LICENSE) | 固定 revision 下載與本機快取 |
| OpenAI Python SDK（雲端基準使用 `openai==2.54.0`） | [Apache-2.0](https://github.com/openai/openai-python/blob/main/LICENSE) | Prototype 雲端研究的 Responses API 串接 |
| Google Gen AI Python SDK（`google-genai==2.22.0`） | [Apache-2.0](https://github.com/googleapis/python-genai/blob/main/LICENSE) | Prototype 早期實驗與雲端研究的 Gemini Interactions API 串接 |
| Pillow | [HPND 與附帶條款](https://github.com/python-pillow/Pillow/blob/main/LICENSE) | 圖片解碼、驗證與轉換 |
| PyYAML | [MIT](https://github.com/yaml/pyyaml/blob/main/LICENSE) | Prototype YAML 設定 |
| psutil | [BSD-3-Clause](https://github.com/giampaolo/psutil/blob/master/LICENSE) | 系統資訊 |
| nvidia-ml-py | [BSD-3-Clause](https://pypi.org/project/nvidia-ml-py/) | GPU 記憶體觀測 |
| pytest | [MIT](https://github.com/pytest-dev/pytest/blob/main/LICENSE) | Python 測試 |
| Playwright | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) | 瀏覽器測試；下載的瀏覽器另有自身授權 |
| nginx | [BSD-2-Clause](https://nginx.org/LICENSE) | 靜態網站與同源 API／SSE 代理 |
| mkcert | [BSD-3-Clause](https://github.com/FiloSottile/mkcert/blob/master/LICENSE) | 本機開發 HTTPS 憑證 |
| Docker Engine／Compose | [Moby Apache-2.0](https://github.com/moby/moby/blob/master/LICENSE)、[Compose Apache-2.0](https://github.com/docker/compose/blob/main/LICENSE) | 容器部署；Docker Desktop 適用另外的產品條款 |

## 資料與圖形

- [`mock-data/scenarios.json`](../mock-data/scenarios.json) 是內建合成測試情境；
  畫面中的樣本圖由前端依固定情境繪製，不能當作真實 OCR 結果。
- UI 圖形、CSS 與 [`favicon.svg`](../frontend/public/favicon.svg) 存於本專案；
  使用系統字型，不附帶第三方照片庫、音樂或下載字型。
- 相機／上傳圖片由展示者提供，需自行取得使用及公開展示權利；其授權不因
  上傳而轉移至本專案。
- 本次 reviewed physical run 的照片、人工標記、辨識原文及衍生評分保留本機，
  不作公開素材散布。詳細範圍見 [Prototype 資料處理說明](https://github.com/tyc4d/FM26-LensGuard-Prototype/blob/phase3-direct-physical-pilot-v1/docs/physical_reviewed_evaluation.md)。
