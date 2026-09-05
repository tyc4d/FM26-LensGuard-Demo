# 第三方套件與素材來源

以下列出作品直接使用的主要套件。前端確切版本與完整相依樹記錄於
[`package-lock.json`](../frontend/package-lock.json)，Demo 後端版本記錄於
[`requirements.txt`](../backend/requirements.txt)，模型環境見
[本機模型安裝](local-model-setup.md)。每個套件附帶的 LICENSE／NOTICE 仍適用，
本專案的 MIT 授權不取代上游條款。

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
| Qwen3-VL-8B-Instruct | [模型頁與 Apache-2.0](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct) | 本機視覺與文字模型；權重不隨 repo 提交 |
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
- Prototype 中歷史研究的其他模型與雲端 SDK 不屬於本次 Qwen Demo 的必要服務；
  若另行執行研究程式，應依該工具文件與各模型／服務條款處理。
