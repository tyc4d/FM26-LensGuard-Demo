# Prototype 連結與版本管理

Demo 根目錄的 `prototype` 是 Git submodule，GitHub 檔案列表會顯示
`prototype @ <commit>`，點擊即可前往 [Prototype repo](https://github.com/tyc4d/FM26-LensGuard-Prototype)
的對應版本。

```text
FM26-LensGuard-Demo/
├── .gitmodules    # Prototype 的 GitHub URL 與開發分支
└── prototype/    # 獨立 Prototype repo 的固定 commit
```

[`.gitmodules`](../.gitmodules) 設定 HTTPS repo URL 與
`phase3-direct-physical-pilot-v1` 分支；Demo 的 Git tree 以 `160000`
gitlink 記錄固定 commit。兩個 repo 保留獨立 Git 歷史，Demo 不把
Prototype 原始碼複製進自己的歷史。一般 clone／update 會取得 Demo 記錄的
commit，不會自動追到分支最新版本。

## 首次取得

```bash
git clone --recurse-submodules https://github.com/tyc4d/FM26-LensGuard-Demo.git
cd FM26-LensGuard-Demo
git submodule status
```

已取得 Demo、但尚未初始化 submodule 時：

```bash
# 從 Demo 根目錄執行
git submodule update --init --recursive
git -C prototype rev-parse HEAD
```

目前固定於 [`49aba429147c26a61ff4c9f5e44042526939b3ad`](https://github.com/tyc4d/FM26-LensGuard-Prototype/commit/49aba429147c26a61ff4c9f5e44042526939b3ad)，
驗證結果見 [測試紀錄](testing.md)。submodule checkout 預設為 detached HEAD，
適合重現該版本；開發前需先切換或建立分支。Mock 模式可省略 submodule 下載。

## 從舊版 symlink 升級

在乾淨的 Demo checkout 更新後初始化：

```bash
git pull --ff-only
git submodule update --init --recursive
```

舊版 `prototype -> ../FM26-LensGuard-Prototype` 會換成 submodule 目錄。
原本相鄰的 `FM26-LensGuard-Prototype` checkout 及其中的本機檔案仍保留；
新的 `prototype/` 是獨立 checkout，兩個工作目錄的未提交修改不會互相同步。
submodule 不需要作業系統的 symlink 權限。

## 開發與更新版本

```bash
# 從 Demo 根目錄檢查兩個獨立工作樹
git status
git -C prototype status

# 開發 Prototype 前切換至開發分支
git -C prototype switch phase3-direct-physical-pilot-v1
```

Prototype 的修改需在 Prototype repo 提交與推送。要讓 Demo 採用新版本，
先確認該 Prototype commit 已推送且通過驗證，再在 Demo 執行
`git add prototype` 並提交版本指標更新。`.gitmodules` 的 `branch` 只供
明確執行 `git submodule update --remote prototype` 時選擇追蹤分支。
日常更新 Demo 後執行 `git submodule update --init --recursive`，重現 Demo
記錄的 commit。

Demo backend 透過 `PROTOTYPE_RUNTIME_URL` 呼叫獨立 HTTP 服務。
模型程式與 Python 環境由 Prototype 管理。Docker build context 明確排除
`prototype`，模型在主機執行。

`scripts/lensguard-prototype.service` 的工作目錄使用
`%h/FM26-LensGuard-Demo/backend`，以 `backend/.venv/bin/python` 啟動 NVIDIA gateway。
Gateway 在 `%h/FM26-LensGuard-Demo/prototype` 啟動獨立 worker；Nemotron 使用
`%h/venvs/lensguard-nemotron`，Cosmos 使用 `%h/venvs/lensguard-vlm`。
非此目錄配置請依 [NVIDIA 操作說明](nvidia-demo.md)設定環境路徑；修改 unit 後需要
`systemctl --user daemon-reload`，並在無分析進行時重新啟動服務。完整操作見 [維運指南](development.md#docker-and-real-mode)。
