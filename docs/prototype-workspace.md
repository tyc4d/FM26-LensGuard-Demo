# Prototype 連結與版本管理

Demo 根目錄的 `prototype` 是 Git 追蹤的相對符號連結（symlink）：

```text
工作目錄/
├── FM26-LensGuard-Demo/
│   └── prototype -> ../FM26-LensGuard-Prototype
└── FM26-LensGuard-Prototype/
    └── .git/
```

兩個 repo 各自保留 commit、branch 和 remote。透過 `prototype/` 編輯的檔案
實際存於 Prototype，必須在 Prototype 提交與推送。Demo 只追蹤連結本身，
不會把 Prototype 內容複製進自己的 Git 歷史。此連結不會自動下載或鎖定版本。

## 首次取得

從同一個父目錄取得兩個 repo；若已經存在，直接使用原 checkout。

```bash
git clone https://github.com/tyc4d/FM26-LensGuard-Demo.git
git clone --branch phase3-direct-physical-pilot-v1 https://github.com/tyc4d/FM26-LensGuard-Prototype.git
cd FM26-LensGuard-Demo
readlink prototype
git -C prototype status --short --branch
```

Prototype 的 Demo runtime 位於 `phase3-direct-physical-pilot-v1` 分支。
繳交驗證版本記錄於 [測試紀錄](testing.md)。要重現固定版本，請在乾淨的
Prototype checkout 中以 `git switch --detach <commit>` 選取該版本；
日常開發使用原分支即可。

Linux/macOS checkout 會建立符號連結。Windows 需啟用 Developer Mode 或
建立 symlink 的權限，並用 `git -c core.symlinks=true clone ...` 取得 Demo；
否則 Git 可能把連結存成文字檔。GitHub 網頁不會把相對 symlink 展開成另一個
repo，請使用 [Prototype repo](https://github.com/tyc4d/FM26-LensGuard-Prototype/tree/phase3-direct-physical-pilot-v1)
瀏覽原始碼。

## 開發與執行

```bash
# 從 Demo 根目錄操作兩個獨立工作樹
git status
git -C prototype status
```

Demo backend 仍透過 `PROTOTYPE_RUNTIME_URL` 呼叫獨立 HTTP 服務。
模型程式與 Python 環境由 Prototype 管理。Docker build context 明確排除
`prototype`，模型在主機執行；Mock 模式可在沒有 Prototype checkout 時獨立運作。

`scripts/lensguard-prototype.service` 的工作目錄使用
`%h/FM26-LensGuard-Demo/prototype`。模型環境仍是既有的
`%h/venvs/lensguard-vlm`。非此目錄配置請調整 unit 後再安裝；修改檔案不會
自動重啟已在執行的模型服務。完整操作見 [維運指南](development.md#docker-and-real-mode)。
