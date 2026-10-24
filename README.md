# KakeraMC Launcher

跨平台（Windows / macOS / Linux）的 Minecraft: Java Edition 启动器，基于 Electron + React + TypeScript。

当前版本 **0.1.0**，聚焦核心启动链路：微软账户、实例管理、原版与 Mod 加载器自动安装、Java 运行时准备、启动与日志。

## 已实现

- **微软账户登录**：OAuth2 授权码流程（MSAL 官方库，系统浏览器 + 回环重定向），Xbox Live / XSTS / Minecraft 服务链路，令牌用系统密钥环（DPAPI / Keychain / libsecret）加密落盘，过期自动静默刷新，失败时明确标记「需要重新登录」。
- **离线档案**：仅用于单人游戏与本地测试，界面明确标注；正版服务器会拒绝。
- **实例（实例隔离）**：每个实例有自己的存档、模组、日志目录，共享 `libraries/`、`assets/`、`versions/`、`runtime/`。
- **自动化安装**：从 Mojang 官方清单解析版本 → 下载 client jar、libraries、asset index 与全部资源对象 → 解压 natives；加载器可选 **Vanilla / Fabric / Quilt / Forge / NeoForge**。
- **Java 运行时**：优先复用手动指定或系统 JVM，按版本要求（`javaVersion.majorVersion`）匹配；缺失时自动下载 Mojang 官方运行时（`javaVersion.component`），并带上真实进度。
- **启动与日志**：进程参数、内存与 JVM 参数、真实退出码、崩溃报告路径、每个实例一份日志文件，日志中的访问令牌会被脱敏。
- **文件校验与修复**：逐文件校验 SHA-1，报告缺失/损坏并可重新安装修复。
- **界面**：简体中文默认、英文可切换；键盘可完成主流程（`Ctrl/Cmd+Enter` 启动，`Esc` 关闭对话框）。

## 尚未实现（v2 计划）

Modrinth 模组搜索与安装、整合包（`.mrpack` / `.zip`）导入、OptiFine、自动更新、浅色主题、托盘常驻、多实例并行启动、下载镜像。

## 环境要求

- Node.js **>= 22**（开发与构建）
- npm 11+
- 运行游戏需要 Java：启动器会按版本自动检测/下载，无需手工安装

## 快速开始

```bash
npm install          # postinstall 会修复两个 @xmcl 上游发布缺陷，见「已知问题」
npm run dev          # 开发模式（Vite HMR + Electron）
npm run build        # 类型检查 + 打包三端产物到 out/
npm start            # 用构建产物启动
```

首次启动后：`新建` 创建实例 → 选择版本与加载器 → `安装并启动`。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式 |
| `npm run build` | 类型检查 + 构建 main/preload/renderer |
| `npm start` | 运行构建产物 |
| `npm test` | 单元测试（vitest，离线） |
| `npm run e2e` | Electron 端到端测试（Playwright，含 axe 无障碍扫描） |
| `npm run verify:real` | **联网**真实安装验收：安装当前最新版本并逐文件校验 |
| `npm run lint` | ESLint |
| `npm run icons` | 由同一套几何重新生成 `build/icon.png` |
| `npm run dist:win` | Windows 安装包 + 便携版 |
| `npm run dist:mac` / `dist:linux` | 对应平台产物 |

## 数据与配置位置

| 内容 | 位置 |
| --- | --- |
| 设置、账户、令牌库 | Electron `userData`（Windows：`%APPDATA%\KakeraMC Launcher`） |
| 游戏文件 | 设置中的「游戏目录」，默认 `userData/minecraft` |
| 实例 | `<游戏目录>/instances/<id>/` |
| 日志 | `<游戏目录>/instances/<id>/logs/`；启动器自身日志在 `userData/logs/launcher.log` |

环境变量：

- `KAKERAMC_USERDATA`：覆盖 `userData` 目录（便于测试/便携使用）
- `KAKERAMC_MS_CLIENT_ID`：覆盖微软应用 Client ID
- `KAKERAMC_E2E_FAKE=1`：使用确定性测试后端（E2E 专用，不下载任何文件）

## 微软登录需要你自己的 Azure 应用

启动器不内置任何第三方 Client ID。按 [docs/microsoft-oauth-setup.md](docs/microsoft-oauth-setup.md) 注册一个公共客户端应用，把 Client ID 填入「设置 → 微软登录」，或用环境变量提供。未配置时仍可使用离线档案。

## 目录结构

```
src/main/            主进程：窗口、IPC、领域逻辑（core/ 不依赖 Electron）
src/preload/         contextBridge 白名单桥接
src/shared/          IPC 通道、zod schema、DTO 类型、错误码
src/renderer/        React 界面、设计令牌、i18n、状态
tests/unit           vitest 单元测试
tests/e2e            Playwright + Electron 端到端测试（含 axe）
tests/integration    联网验收测试（默认跳过）
docs/                架构、安全、OAuth 配置、质量报告
```

## 已知问题（上游依赖）

`@xmcl/core@2.16.x` 与 `@xmcl/unzip@2.2.0` 的 npm 包存在发布缺陷（`main` 指向 `.ts`、缺少 `exports`/`dist/utils.js`），会让任何直接安装它们的项目崩溃。`scripts/fix-xmcl-packages.mjs` 在 `postinstall` 中原地修复，幂等且在上游修复后自动失效。这是对上游缺陷的临时补丁，不是项目自身的架构选择。

## 文档

- [架构](docs/ARCHITECTURE.md)
- [安全模型](docs/SECURITY.md)
- [微软登录配置](docs/microsoft-oauth-setup.md)
- [质量报告](docs/quality-report.md)

## 许可

MIT。本项目不分发 Minecraft 的任何文件；所有游戏资源均由用户在本地从 Mojang 官方服务下载。Minecraft 是 Mojang Studios 的商标，本项目与其无隶属关系。
