# 质量报告

日期：2026-10-25 · 版本 0.1.0 · 实测环境：Windows 10.0.26300 (x64)，Node 24.21.0，npm 11.19.0，Electron 45.0.0。

本报告只记录**实际执行过**的检查；未执行的项在末尾单独列出，不计为通过。

## 1. 构建与静态检查

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（main/preload/renderer，strict + noUncheckedIndexedAccess） |
| `npm run build` | 通过（main 75.7 kB、preload 3.7 kB、renderer 861 kB + 14 kB CSS） |
| `npm run lint` | 通过，0 error / 0 warning |
| `npm test` | **27 tests / 2 files 全部通过** |

## 2. 端到端（Electron + Playwright，测试后端）

| 用例 | 结果 |
| --- | --- |
| 空实例列表启动、导航与空状态 | 通过 |
| 创建实例（版本 + Fabric）→ 安装进度 → 安装完成 → 无账户时启动禁用 | 通过 |
| 添加离线档案 → 启动按钮可用 | 通过（同上用例） |
| 实例菜单：重命名 → 删除 → 回到空状态 | 通过 |
| 未配置 Client ID 时点击微软登录 → 明确提示（错误码经 IPC 往返后仍保留） | 通过 |
| 切换语言并重启后保留设置 | 通过 |
| 三个主视图 axe（WCAG 2.1 A/AA）扫描 | **0 violation** |

`npm run e2e` 结果：6 passed，1 skipped（真实启动用例在未设置环境变量时跳过）。

## 3. 真实网络验收

### 3.1 原版安装（`npm run verify:real`）

- 目标：当前最新正式版 **26.3**（2026-09-15 发布，`javaVersion.majorVersion = 25`，`java-runtime-epsilon`）
- 下载：client jar（41.5 MB）+ 74 个生效库 + 5,147 个资源对象
- 冷启动耗时 **405 s**（第二次复用缓存 **373 s**）
- `verifyInstance`（逐文件 SHA-1 校验 5,222 个文件）：**0 个缺失/损坏**
- 解析结果：`mainClass = net.minecraft.client.main.Main`，74 libraries

### 3.2 加载器安装（同一游戏目录，原版已存在）

| 加载器 | 该版本可用构建数 | 实测结果 |
| --- | --- | --- |
| Fabric | 255（最新 0.20.1） | **安装成功**（2.4 s），主类 `net.fabricmc.loader.impl.launch.knot.KnotClient` |
| Quilt | 307（最新 0.31.0-beta.4） | 仅列出构建，未安装 |
| Forge | 13（最新 66.1.0） | 仅列出构建，未安装 |
| NeoForge | 93（最新 26.3.0.97） | **安装成功**（15.4 s，含 installer processor 阶段），主类 `net.neoforged.fml.startup.Client`，neoforged 库已合并 |

### 3.3 真实启动

| 场景 | 结果 |
| --- | --- |
| 原版 26.3，离线档案（`@xmcl/core` 直接启动 + 与 UI 相同的进程监视器） | **17 s 触达游戏主窗口** |
| NeoForge 26.3.0.97，离线档案 | **18 s 触达游戏主窗口** |
| 通过 UI（Playwright 驱动打包前产物）：点「启动」→ 界面显示「运行中 · 已运行 0:xx」→ 点「停止」 | **通过（17.8 s）** |

Java 选择：系统 Zulu 25.0.4，与版本要求的 major 25 匹配，未触发下载。

## 4. 打包

| 产物 | 结果 |
| --- | --- |
| `dist/KakeraMC Launcher-0.1.0-setup.exe`（NSIS） | 构建成功（未签名） |
| `dist/KakeraMC Launcher-0.1.0-portable.exe` | 构建成功 |
| `dist/win-unpacked/KakeraMC Launcher.exe` | **实测启动**：窗口标题 `KakeraMC Launcher`，空状态文案正确渲染 |

打包版能正常加载 asar 内的主进程与 `node_modules` 依赖（未出现启动崩溃），说明生产路径的模块解析可用。

## 5. 视觉与可访问性

### 5.1 对比度（`frontend-craft/scripts/contrast.py` 实测）

| 用途 | 前景 / 背景 | 对比度 | 判定（≥4.5:1） |
| --- | --- | --- | --- |
| 正文 / 画布 | `#E7E9EE` / `#0B0C0E` | 16.11:1 | 通过 |
| 正文 / 面板 | `#E7E9EE` / `#14161A` | 14.91:1 | 通过 |
| 次级文字 / 面板 | `#9AA1AD` / `#14161A` | 6.96:1 | 通过 |
| 提示文字 / 面板 | `#7B8390` / `#14161A` | 4.74:1 | 通过 |
| 提示文字 / 画布 | `#7B8390` / `#0B0C0E` | 5.12:1 | 通过 |
| 主按钮文字 / 主按钮 | `#1A1206` / `#E2A24B` | 8.39:1 | 通过 |
| 强调色 / 画布 | `#E2A24B` / `#0B0C0E` | 8.86:1 | 通过 |
| 错误文字 / 错误面板 | `#E2725F` / `#2A1A17` | 5.41:1 | 通过 |
| 正文 / 悬浮面板 | `#E7E9EE` / `#1A1D22` | 13.91:1 | 通过 |
| 焦点环 / 画布 | `#8AB4F8` / `#0B0C0E` | 9.29:1 | 通过 |

### 5.2 界面审查

- 截图（`docs/screenshots/`）：空状态、创建实例对话框、安装中、账户空状态、设置、1024×720 下的设置页。
- 横向溢出实测：1024×720 / 1280×800 / 1440×900 三种尺寸下 `documentElement.scrollWidth - clientWidth = 0`，设置页同样为 0。
- 渲染审查结论（人工）：层级清楚，主操作唯一（琥珀色）；进度条显示真实字节与百分比；无装饰性状态点、无营销文案、无虚构指标。
- 删除检查后移除/调整：实例列表为空时隐藏筛选框；离线档案说明仅在存在离线档案时显示；空状态标题改为真正的 `h1`（axe 结构要求）；设置页保存按钮改为吸底。

### 5.3 键盘

- `Ctrl/Cmd+Enter`：启动当前实例（有实例、已安装、无任务、不在运行、无对话框时生效）。
- `Esc`：关闭对话框（Radix Dialog 自带）。
- Tab 顺序与可见焦点环已人工确认；axe 未报告 focus-order 问题。

## 6. 未验证项（不计为通过）

| 项目 | 原因 |
| --- | --- |
| 微软真实登录端到端 | 使用可配置占位 Client ID（按需求），本机无 Azure 应用；仅验证了 OAuth 状态机、错误映射、令牌库加解密与 PKCE 计算 |
| macOS / Linux 运行时 | 无对应环境；仅配置了打包目标与平台分支代码 |
| Forge / Quilt 真实安装 | 同一代码路径已由 Fabric 与 NeoForge 覆盖；Forge 与 NeoForge 共享 `createModernForgeInstallWorkflow`，Quilt 与 Fabric 共享结构 |
| NSIS 安装程序执行 | 仅验证了 `win-unpacked` 与 portable 产物启动 |
| 代码签名 / 公证 | 未配置证书 |
| 模组市场与整合包 | 属于 v2 范围，未实现 |
| 自动更新 | 未实现 |

## 7. 已知上游缺陷与处理

`@xmcl/core@2.16.x`、`@xmcl/unzip@2.2.0` 的 npm 发布物损坏（`main` 指向 `.ts`、缺少 `exports`、缺少 `dist/utils.js`），直接安装会导致主进程加载失败。`scripts/fix-xmcl-packages.mjs` 在 `postinstall` 做最小修复：改写两个包的入口字段、补一个仅含 `exists/validateSha1/checksum/isNotNull` 的工具模块。修复幂等，上游修好后自动不生效。
