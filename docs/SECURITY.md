# 安全模型

一个启动器同时持有「账户令牌」和「用户机器上的任意文件写入 / 进程执行」两种能力，因此所有特权操作只存在于主进程，渲染层按不可信内容处理。

## 威胁与缓解

| 风险 | 缓解措施 | 代码位置 |
| --- | --- | --- |
| 渲染层被注入后取得 Node 能力 | `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`；preload 仅暴露白名单方法 | `src/main/window.ts`、`src/preload/index.ts` |
| 加载远程/被篡改的页面 | 生产环境只允许 `app://kakera/`（自定义协议，路径包含校验）；`will-navigate` 与 `setWindowOpenHandler` 全部拒绝，外链只经 allowlist 交给系统浏览器 | `src/main/index.ts`、`src/main/window.ts` |
| XSS / 注入脚本外联 | 响应头注入 CSP：`default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`（样式允许 inline，Radix 定位需要） | `src/main/index.ts` |
| 其他进程冒用 IPC | 每个 handler 校验 `event.senderFrame.url` 属于开发服务器或 `app://kakera`，否则直接抛错 | `src/main/ipc/register.ts` |
| 恶意/畸形 IPC 入参 | 所有通道用 zod schema 解析；实例 id 等路径片段再过 `assertSafeSegment` | `src/main/ipc/register.ts`、`src/main/core/paths.ts` |
| 路径穿越写文件 | 渲染层永不传绝对路径；主进程按 id 自行拼路径，并用 `isInside()` 做包含检查 | `src/main/core/paths.ts` |
| 令牌明文落盘 | `safeStorage`（Windows DPAPI / macOS Keychain / Linux libsecret）加密后再写 `accounts.vault.json`；密钥环不可用时**不落盘**，仅内存并提示用户 | `src/main/core/auth/vault.ts` |
| 令牌泄漏到日志 | 进程输出与启动器日志统一经 `scrubSecrets()`：`--accessToken`、`accessToken` JSON 字段、`Bearer` 头 | `src/shared/errors.ts`、`src/main/core/launch.ts` |
| 任意 URL 打开系统浏览器 | `isAllowedExternal()` 仅允许 https 且命中 allowlist（Microsoft 登录域、minecraft.net、github.com 等） | `src/main/window.ts` |
| 权限静默授予 | 只允许 `clipboard-sanitized-write`，其余权限请求一律拒绝 | `src/main/index.ts` |
| 下载被投毒 | 文件 URL 来自 Mojang/加载器官网清单，落盘前按清单给出的 SHA-1 校验；不做任意 URL 下载 | `@xmcl/installer` + 清单 |
| 命令注入 | 启动游戏与 taskkill 均使用 `spawn(cmd, args[])`（无 shell 拼接）；环境变量最小化 | `src/main/core/launch.ts` |

## 已知限制

1. **访问令牌必然出现在游戏进程参数中**（`--accessToken`），这是 Minecraft 协议要求，无法避免；因此日志脱敏与「不打印完整命令行」是唯一可行的缓解。同一台机器上的其他进程仍可读取该进程的 argv。
2. **未做代码签名**：Windows/macOS 产物默认未签名，会触发 SmartScreen / Gatekeeper 提示；正式分发前需要证书与公证。
3. **未实现自动更新**：因此没有更新通道被劫持的风险，但也意味着修复需要用户手动安装。
4. **依赖供应链**：核心安装在 `@xmcl/*`、`msal-node`、Electron 之上。项目锁定 `package-lock.json`，但未做独立性审计；`postinstall` 会对两个上游发布缺陷做最小修补（仅改 `main`/`exports` 并补一个缺失的工具模块），修补内容可完整审阅。
5. **离线档案不做正版校验**：这是刻意提供的功能，界面已标注仅限单人/测试；它不会绕过任何服务器端验证。

## 报告问题

发现安全问题请勿公开提交 issue，直接联系维护者并附最小复现步骤。请勿在报告中包含真实令牌。
