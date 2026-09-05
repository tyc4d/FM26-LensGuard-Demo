# 本機 Qwen 模型安裝

Demo 真實模式使用相鄰 Prototype repo 的固定 Qwen3-VL-8B-Instruct revision：
`0c351dd01ed87e9c1b53cbc748cba10e6187ff3b`。先完成 [README](../README.md)
的雙 repo clone 與 Demo 前後端安裝。symlink 的限制見 [workspace 說明](prototype-workspace.md)。

## 環境

已驗證主機為 Linux、Python 3.12、RTX 4090 24 GB、PyTorch `2.10.0+cu128`、
Transformers `5.16.1`，使用 BF16。需可執行 `nvidia-smi` 的相容 NVIDIA 驅動。
首次載入要求至少 21,000 MiB 可用 VRAM，常駐後每次請求要求 4,096 MiB，
並拒絕同一 GPU 上的其他運算工作。不要為展示中止既有實驗。

如果這台機器已有 `~/venvs/lensguard-vlm` 與下載好的固定模型，重用原環境，
略過安裝和下載。以下步驟只用於建立**全新且獨立**的模型環境，不是升級現有環境。
這份步驟依目前已安裝版本整理，未在另一台全新 GPU 主機重新驗證。

```bash
# 從 Demo 根目錄進入連結的 Prototype
cd prototype
python3 -m venv "$HOME/venvs/lensguard-vlm"
source "$HOME/venvs/lensguard-vlm/bin/activate"

python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install transformers==5.16.1 accelerate==1.14.0 huggingface-hub==1.30.0 \
  pillow==12.3.0 pydantic==2.13.5 PyYAML==6.0.3 python-dotenv==1.2.3 \
  httpx==0.28.1 psutil==7.2.2 nvidia-ml-py==13.610.43
python -m pip install -r requirements/demo-runtime.txt
python -m pip check

# 驗證介面與 GPU；此步不載入模型
python - <<'PY'
import torch, transformers
from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
from prototype_demo_server.app import create_app
assert torch.__version__ == '2.10.0+cu128'
assert transformers.__version__ == '5.16.1'
assert torch.cuda.is_available()
print(torch.cuda.get_device_name(0))
PY

# 預先下載權重到 Hugging Face 預設快取，勿存進 repo
python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='Qwen/Qwen3-VL-8B-Instruct',
    revision='0c351dd01ed87e9c1b53cbc748cba10e6187ff3b',
)
PY
```

Qwen 模型採 [Apache-2.0](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct)，
公開權重通常不需要 Token；下載需足夠磁碟與網路。服務會設為離線讀取，
缺少模型或 revision 不符會直接失敗。

## 啟動真實模式

先執行 `curl http://127.0.0.1:8010/health` 與 `nvidia-smi` 檢查現況。
如果既有 runtime 已正常執行，直接重用，不啟動第二份模型。
否則在獨立終端機、從 Demo 根目錄啟動：

```bash
cd prototype
source "$HOME/venvs/lensguard-vlm/bin/activate"
python -m prototype_demo_server --model qwen3vl-8b --host 127.0.0.1 --port 8010
```

另一個終端機檢查：

```bash
curl --fail http://127.0.0.1:8010/health
```

第一次分析前 `status: unloaded` 是正常狀態。不要使用多個 workers 或 reload。
將 [README 的後端命令](../README.md#安裝與執行)改成 `LENSGUARD_RUNTIME=prototype`，
前端啟動方式相同。圖片只在按下「開始分析」時送至本機服務；第一個請求包含
模型載入時間。完成後 health 應為 `ready`，`model_loaded` 為 `true`。

原始圖片不保存為研究紀錄，但模型原文與辨識資訊會出現在 Demo 的記憶體結果中；
展示時使用可公開的合成素材。GPU 忙碌、記憶體不足、解析失敗或上游逾時都會
保留錯誤，不會改用其他模型或 Mock 結果。

Linux 上以 Docker 執行 Demo、主機執行模型的方式，見
[維運指南](development.md#docker-and-real-mode)。Windows／macOS 可執行 Mock；
本次真實 GPU 環境只在上述 Linux 主機驗證。
