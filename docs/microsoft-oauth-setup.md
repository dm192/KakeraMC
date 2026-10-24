# 配置微软登录

启动器不内置任何 Client ID：微软要求每个应用以自己的身份注册。你需要一个 **Azure 应用注册**（免费，个人 Microsoft 账户即可）。

## 1. 注册应用

1. 打开 <https://portal.azure.com> → **Microsoft Entra ID** → **应用注册** → **新注册**。
2. 名称：任意（例如 `KakeraMC Launcher`）。
3. 受支持的账户类型：**仅个人 Microsoft 账户**（或「任何组织目录中的账户和个人 Microsoft 账户」，两者都可用）。
4. 重定向 URI：平台选 **移动和桌面应用程序**，值填 `http://localhost`（注意：不要加端口，MSAL 会在运行时使用随机本地端口）。
5. 注册后复制 **应用程序（客户端）ID**，这就是要填的 Client ID。

## 2. 允许公共客户端

**身份验证** → 页面底部 **高级设置** → 把 **允许公共客户端流** 设为 **是** → 保存。

> 不开这个开关，登录会以 `AADSTS7000218` 失败。

## 3. 权限

无需手工添加 API 权限。登录时请求的作用域是 `XboxLive.signin` 与 `offline_access`，由 Microsoft 提供，首次登录时用户会看到同意页。

不要配置客户端密码：这是桌面公共客户端，使用授权码 + PKCE，不应持有 secret。

## 4. 填入启动器

两种方式，任选其一：

- 界面：**设置 → 微软登录 → Azure 应用 Client ID**，粘贴后保存；
- 环境变量：`KAKERAMC_MS_CLIENT_ID=<client-id>`（优先级低于界面设置）。

保存后回到**账户**页点击**微软登录**，系统浏览器会打开登录页；完成后自动回到启动器。

## 5. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `AADSTS700016` / `invalid_client` | Client ID 填错，或应用类型不是公共客户端 | 重新复制 Client ID |
| `AADSTS7000218` | 未启用「允许公共客户端流」 | 见第 2 步 |
| `AADSTS70011` / `invalid_scope` | 应用被限制作用域 | 移除自定义 API 权限后重试 |
| 登录成功但提示没有 Minecraft | 该账户未拥有 Java 版（profile 接口 404） | 换用已购买游戏的账户 |
| XSTS `2148916233` | 账户没有 Xbox 档案 | 先在 xbox.com 创建档案 |
| XSTS `2148916238` | 儿童账户需要家庭批准 | 由家长账户授权 |
| 令牌过期后启动失败 | 静默刷新失败 | 账户页会显示「需要重新登录」，重新登录即可 |

## 令牌存放

登录令牌经操作系统密钥环加密后保存在 Electron `userData` 目录的 `accounts.vault.json`。如果系统没有可用密钥环（常见于未安装 libsecret 的 Linux 桌面），启动器不会写入磁盘，只保存在内存中，并在账户页显示提示。详见 [SECURITY.md](SECURITY.md)。
