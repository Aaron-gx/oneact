# @oneact/desktop · Tauri 壳（v3）

关联 `.act` 文件，本地离线播放/编辑（非另写一套，复用 player runtime）。

## 构建（需 Rust + tauri-cli）

```bash
rustup default stable          # 安装 Rust 工具链
npm install -D @tauri-apps/cli
cd apps/desktop && npm run tauri -- dev    # 开发
cd apps/desktop && npm run tauri -- build  # 打包（产出 .exe/.dmg/.AppImage，含 .act 关联）
```

- `src-tauri/tauri.conf.json` 的 `fileAssociations` 把 `.act` 关联到本应用：双击 `.act` 启动舞台并播放。
- `build.distDir` 指向 `packages/player/dist`（复用 player 单文件产物）。

> 本仓库提供的是配置/源码骨架（策划书第 6 节桌面形态）。实际编译需 Rust 工具链，未在当前 Node 环境构建。
