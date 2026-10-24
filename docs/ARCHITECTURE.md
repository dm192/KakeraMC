# 架构

## 进程模型

```
┌──────────────────────────── 主进程（Node 24 / ESM）────────────────────────────┐
│ Electron app / BrowserWindow / 自定义 app:// 协议 / CSP                         │
│                                                                               │
│  services/LauncherServices  ← 组合根，唯一持有全部特权能力                      │
│    ├─ core/settings      设置（原子写 + zod 校验）                              │
│    ├─ core/instances     实例注册表（每实例一份 instance.json）                │
│    ├─ core/minecraft     版本目录 / 安装流水线 / 加载器 / Java / 校验           │
│    ├─ core/auth          微软 OAuth（MSAL）+ Xbox 链路 + 加密令牌库 + 离线档案   │
│    ├─ core/launch        启动参数、进程监管、日志环缓冲                          │
│    └─ core/tasks         任务与真实进度、取消                                   │
│                                                                               │
│  ipc/register  ← 每个通道：sender 校验 → zod 解析 → 调用服务 → 结果信封        │
└───────────────────────────────────────────────────────────────────────────────┘
                    ▲ contextBridge（白名单方法）         │ 事件推送
┌───────────────────┴─────────────────────────────────────▼─────────────────────┐
│ 渲染进程（sandbox, contextIsolation, 无 Node）                                  │
│   React 19 + zustand + 设计令牌；不直接发起任何网络/文件访问                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

`src/main/core/**` 不 import `electron`：路径、网络、安装、认证、启动都可由 vitest 直接测试。Electron 绑定只出现在 `window.ts`、`ipc/`、`services/`。

## 关键依赖

| 能力 | 依赖 | 说明 |
| --- | --- | --- |
| 版本 JSON 解析与启动 | `@xmcl/core` | `Version.parse`、`launch`、`createMinecraftProcessWatcher` |
| 安装编排 | `@xmcl/installer` | 解析器 + 可执行清单 + 工作流；`InstallRuntime` 可注入 |
| 下载 | `@xmcl/file-transfer`（经 installer 默认运行时） | 断点续传、失败重试、停滞检测、字节级进度 |
| OAuth | `@azure/msal-node` | 回环重定向、PKCE、令牌缓存序列化 |
| Xbox/Minecraft 令牌 | `@xmcl/user` | `acquireXBoxToken` → `loginMinecraftWithXBox` |
| Java 探测 | `@xmcl/installer` (`resolveJava`, `scanLocalJava`) | 版本解析与候选路径 |
| UI 原语 | Radix UI（Dialog / DropdownMenu） | 焦点管理、键盘导航 |
| 校验 | zod | IPC 入参、磁盘数据同源校验 |

## 安装流水线

单个实例的安装（`core/minecraft/install.ts`）：

1. **版本元数据**：`getVersionList` 取清单（10 分钟缓存，绝不硬编码版本号）→ `resolveMinecraftVersionJsonInstallFile` 写入 `versions/<id>/<id>.json`。
2. **基础文件**（一次清单执行）：
   - `resolveLibraryInstallFiles`：按 OS/架构规则筛选的库
   - `resolveMinecraftJarInstallFile`：客户端 jar（41MB 量级）
   - `resolveAssetMetadataInstallManifest`：asset index 与 log4j 配置
3. **资源对象**：索引落盘后才可解析 → `resolveAssetObjectInstallFiles` → 第二批清单执行（数千个对象，SHA-1 校验）。
4. **加载器**：
   - Fabric / Quilt：`resolveFabricInstallManifest` / `resolveQuiltInstallManifest` → 执行清单
   - Forge / NeoForge：`resolveForgeInstallerFile` / `resolveNeoForgedInstallerFile` 取 installer → `createModernForgeInstallWorkflow`（含 processor 阶段）→ `executeInstallWorkflow`，工作流用解析出的 Java 执行
5. **落库**：`resolvedVersionId` 写回 `instance.json`。

进度语义：`InstallRuntime` 内部由 `ProgressTrackerMultiple` 汇总当前批次真实字节数，任务总线以 250ms 轮询并节流推送（≤10Hz）。没有总数时渲染为不确定态，绝不按时间伪造百分比。

## Java 策略

`core/minecraft/java.ts` 的解析顺序：

1. 设置中的手动 Java 路径（用户显式选择，优先）
2. 已安装的 Mojang 官方运行时（`<游戏目录>/runtime/<component>/<platform>/bin/java`）
3. 版本要求主版本号完全匹配的系统 JVM
4. 通过 `createJavaRuntimeInstallWorkflow` 下载官方运行时（按 `javaVersion.component` + 平台键）
5. 仍失败 → `launch.java-missing`，附缺失主版本号，UI 提供手动路径入口

Forge/NeoForge 的 processor 与游戏启动共用同一个解析结果，避免「启动器用 Java 17、processor 用 Java 8」这类不一致。

## 启动

`core/launch.ts` 负责：

- `Version.parse` → `java.ensure` → `launch({ gamePath, resourcePath, ... })`
  - `gamePath` = 实例目录（存档/模组/日志隔离）
  - `resourcePath` = 游戏根（共享 libraries/assets/versions）
- 进程输出按行脱敏（`--accessToken`、`Bearer`）后进入环缓冲（5000 行）+ 实例日志文件
- `createMinecraftProcessWatcher` 提供 `minecraft-window-ready` / `minecraft-exit`（含崩溃报告路径）/ `error`
- 状态机：`preparing → starting → running → exited | crashed`；UI 只显示这些真实状态与退出码
- 关闭启动器不会杀掉游戏进程；同一时刻最多一个游戏进程

## 认证

```
浏览器授权码（MSAL, PKCE + 回环）
   → Microsoft access token
   → XBL (user.auth.xboxlive.com) → XSTS (xsts.auth.xboxlive.com)
   → api.minecraftservices.com/authentication/login_with_xbox
   → api.minecraftservices.com/minecraft/profile（拿 uuid / 用户名，404 = 未拥有游戏）
```

- 令牌：`msalCache`（含 refresh token）与 Minecraft token 一起经 `safeStorage` 加密后写入 `accounts.vault.json`；密钥环不可用时只驻留内存并显式警告。
- 静默刷新：Minecraft token 剩余 < 60s 时用缓存账号 `acquireTokenSilent`；失败则标记 `needsReauth` 并阻止启动。
- 离线档案：`OfflinePlayer:<name>` 的 MD5 命名 UUID，与 Java 行为一致。

## 数据模型

```
userData/
  settings.json          { language, gameRoot, memoryMb, jvmArgs, downloadConcurrency, javaPath, microsoftClientId }
  accounts.json          { accounts: [{id, type, name, uuid, needsReauth}], selectedId }
  accounts.vault.json    { entries: { <accountId>: base64(safeStorage 密文) } }
  logs/launcher.log
  minecraft/             ← 可配置
    versions/ libraries/ assets/ runtime/
    instances/<id>/{instance.json, mods/, logs/, saves/, config/}
```

所有写入都经 `JsonFile`（临时文件 + rename 原子替换），校验失败回退默认值。

## IPC 契约

- 通道常量与 DTO：`src/shared/channels.ts`、`src/shared/types.ts`、`src/shared/schemas.ts`
- 主进程统一返回信封 `{ ok: true, value } | { ok: false, error: AppError }`；preload 解包并把 `code` 挂到 `Error` 上
- 错误码稳定（`auth.needs-reauth`、`launch.java-missing`…），**文案归渲染层**：主进程只发 i18n key 与参数，不发中文/英文句子
- 推送事件：`tasks`、`launch-state`、`launch-log`、`accounts`、`settings`

## 测试策略

| 层 | 位置 | 是否联网 |
| --- | --- | --- |
| 单元 | `tests/unit` | 否 |
| 端到端（含 axe） | `tests/e2e` | 否（测试后端） |
| 真实安装/启动验收 | `tests/integration` | 是，显式 `npm run verify:real` |

E2E 用 `KAKERAMC_USERDATA` 指向临时目录、`KAKERAMC_E2E_FAKE=1` 替换安装与版本清单，使 UI 状态机可确定性断言；真实安装/启动只走显式验收命令，避免日常测试依赖网络。
