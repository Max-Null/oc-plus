# OC 上下文精简方案对比

> 验证日期：2026-07-19 · **ACP 已安装**（`opencode plugin opencode-acp@latest --global`）— 本机 OC 内置压缩已禁用
>
> 安装命令：`opencode plugin opencode-acp@latest --global`
> 安装后必须禁用 OC 内置压缩：`opencode.json` 中 `"compaction": { "auto": false }`
>
> **2026-08-06 补充**：新增 [实战踩坑：Clash 代理导致压缩 fetch failed](#实战踩坑clash-代理导致压缩-fetch-failed)

## 社区插件

| 插件 | Stars | 周下载 | 核心思路 | 维护状态 |
|------|-------|--------|---------|---------|
| [DCP](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning) | 2,260 | 19K | 模型调用 compress 工具自主裁剪，支持 range/message 两种模式 | ⚠️ 开发放缓，新功能转向 Sleev |
| [ACP](https://github.com/ranxianglei/opencode-acp) | — | 2.3K | DCP 硬分支，35 bug 修复，"市场上最好的上下文管理" | ✅ 活跃（2026.7 仍在更新） |
| [Sleev](https://sleev.ai) | — | — | DCP 作者的进化版，本地代理层（CC/Codex/OC 通用） | ✅ 推荐新用户使用 |
| [opencode-context-compress](https://github.com/AidenGeunGeun/opencode-context-compress) | 2 | — | 纯手动触发，用户控制何时压缩 | 小众 |

## DCP/ACP 工作方式

```
上下文接近阈值（默认 100K token）
  ↓
模型收到压缩提示（nudge）
  ↓
模型调用 compress 工具
  ↓
压缩指定区间 → 存为摘要块
  ↓
原始内容被替换为占位符（不丢，存在插件存储中）
  ↓
后续 LLM 请求只拿到精简后的上下文
```

关键特性：
- **模型自主决定**何时压缩、压缩什么（不是固定 token 触发）
- **非破坏性**：原始消息保留在 OC 存储中，可 `/acp decompress` 恢复
- **支持嵌套压缩**：压缩的摘要可以被再次压缩
- **保护机制**：可配置保护特定 tool 输出不被裁剪
- **token 消耗**：100 万窗口的模型实际只用 20-30 万 token（ACP 自称）

## 学术前沿（2026.6）

- **SelfCompact**：模型决定何时压缩 + 轻量 rubric。不比固定阈值差，token 成本降 30-70%
- **"lost in compaction"**：即使 5% 压缩也损失 7pp recall。注意力容量是瓶颈，不是压缩质量
- **Claude Code**：5 种压缩机制（auto、partial、sub-agent、microcompact=无 LLM、跨会话共享）

## 对我们项目的意义

V2.0 三层漏斗 + DCP/ACP 可以互补：
- DCP/ACP 解决**上下文膨胀**（token 层面）
- V2.0 解决**行为纠偏**（决策层面）
- 两个层面互不冲突，可以同时使用

## 社区反馈的 Trade-off

**短会话/小任务**：激进裁剪导致 LLM "降智"——原始上下文中的细节被过早压缩，模型失去精确信息，只能依赖模糊摘要推理。代价 > 收益。

**长会话/复杂任务**：上下文自然膨胀到数十万 token，"lost in the middle"效应加剧，不裁剪反而更差。压缩丢掉的 7pp recall 远小于注意力稀释带来的损失。收益 > 代价。

**启示**：上下文精简不应一刀切——短会话不裁剪，长会话动态启用。这需要一个判断机制（会话长度阈值、任务复杂度评估），恰好是 guardian agent 可以承担的职责。

## 动态阈值：一个真实空白

截至 2026 年 7 月，没有任何生产系统实现"根据会话特征动态决定是否启用裁剪"。

所有系统都依赖某种固定 token 阈值或百分比触发：

| 系统 | 触发方式 | 是否根据会话内容动态调整？ |
|------|---------|-------------------------|
| Claude Code 四层压缩 | 固定 83.5% token 阈值 | ❌ |
| DCP/ACP | 模型窗口 55% 软阈值 + adaptive nudge（按窗口大小自适应） | ❌ 只根据窗口大小，不根据内容 |
| Codex CLI | 固定 token 触发 | ❌ |
| DYCP (学术论文) | KadaneDial 语义片段选择 | ⚠️ 根据 query 语义选片段，但不决定"是否启用" |

**CC 社区已有讨论方向**（[Issue #58254](https://github.com/anthropics/claude-code/issues/58254)）：

> "关键是丢失了多少具体事实（文件路径、IP、错误码），不是压缩了多少文本"

提出用 **fact survival rate**（压缩前后具体实体存活率）替代固定 token 百分比——抽象讨论比调试会话更能容忍压缩。但截至 2026.7 只停在讨论阶段，未实现。

## 为什么不让 LLM 自己精简？

直觉上最合理：LLM 知道什么重要，让它自己决定保留什么、丢弃什么。

实际上这已是现有方案的核心设计：DCP/ACP 的 compress 工具就是让 LLM 主动调用压缩。SelfCompact 论文也证明「模型自主压缩」比「固定阈值触发」效果好。

但有一个结构性问题：**LLM 的上下文是 append-only 的**——它能读但不能删。它必须通过 tool call 请求外部系统删除内容。而 LLM 天然有"忘记调用工具"的倾向（和忘记调 web_search 是同一个问题）。

所以 SelfCompact 的结论是：**工具（能做）+ rubric（判断何时该做）= 两者缺一不可**。

- 工具（compress）已经存在——DCP/ACP 提供了
- rubric（判断时机）还停留在「模型窗口 55%」这种粗糙阈值

**根本瓶颈不是压缩质量，是判断时机的智能化**——而这恰好是 guardian agent 可以承担的职责：观察会话特征 → 判断该不该裁 → 触发 LLM 主动压缩。

---

## 实战踩坑：Clash 代理导致压缩 fetch failed

> 2026-08-06 · 症状、根因、修复全记录。**凡是用 Clash for Windows 类代理 + OC Desktop 的用户都可能遇到。**

### 症状

- 多个会话的 compress 工具调用持续返回 `fetch failed`（网络层 TypeError，非 HTTP 错误码）
- `acp_status` 能返回但全部为 0（内部 `fetchSessionMessages` 失败被 try/catch 吞掉）
- 外部 curl/Node fetch 访问本地 server 全部正常 → 排查指向插件进程内部

### 根因

1. **ACP 压缩主流程纯本地**：`createCompressRangeTool` → `client.session.messages()` → SDK `GET /session/{id}/message`（走本地 HTTP，不调 LLM）
2. **OC Desktop server 只监听 IPv4**：`127.0.0.1:随机端口`，且每次重启端口变化
3. **Clash 开启时（WinINET ProxyEnable=1）**：插件进程的本地回环请求被送进 127.0.0.1:7890 代理
4. **Clash 订阅规则含 `IP-CIDR,127.0.0.1/32,REJECT,no-resolve`** → 本地请求被 REJECT → `fetch failed`
5. Electron 网络栈同样受影响（desktop main.log 出现 `net::ERR_PROXY_CONNECTION_FAILED`）

### 修复：CFW Parsers 注入本地 DIRECT 规则

直接改订阅文件无效（订阅每 24h 自动刷新覆盖）。正确做法是用 Clash for Windows 的 **Parsers（配置文件预处理）**，在每次订阅更新后自动追加规则：

1. CFW 左侧「配置」→ 右键当前 profile → **「配置文件预处理」**（Parsers 编辑器，不是「设置」页）
2. 粘贴以下配置并保存：

```yaml
parsers:
  - reg: '.*'
    yaml:
      prepend-rules:
        - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
        - IP-CIDR6,::1/128,DIRECT,no-resolve
        - DOMAIN-SUFFIX,localhost,DIRECT
```

3. 右键 profile → **「更新」** 触发重新解析（外部写入 cfw-settings.yaml 不会自动生效）
4. 验证：更新后规则列表前 3 条应为 `IPCIDR 127.0.0.0/8 → DIRECT` 等，compress 立即恢复

### 诊断要点速查

| 排查项 | 方法 |
|--------|------|
| 代理是否劫持本地请求 | `Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 看 ProxyEnable/ProxyServer |
| 本地 server 端口 | OC Desktop 日志（`%USERPROFILE%\.local\share\opencode\log\`）+ `Get-NetTCPConnection -State Listen` |
| 插件侧请求是否成功 | ACP debug 日志：`acp.jsonc` 加 `"debug": true` → `~/.config/opencode/logs/acp/daily/` |
| Clash 是否 REJECT 本地 | Clash 日志页观察 127.0.0.1 连接的 REJECT 记录 |
