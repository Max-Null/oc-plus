# omo-slim 架构分析

> 分析时间：2026-07-20 | 版本：oh-my-opencode-slim v2.2.0 | 方法：通读 dist/index.js 39510 行源码

## 核心结论

omo-slim 本质是一个**完整的 agent 编排框架**（而非普通插件），通过 OC 插件 SDK 的 17 个 hook 深度介入 OC 运行时：

1. **config hook**：动态注入 agent 定义、MCP 服务器、命令、权限规则
2. **system.transform hook**：将 orchestrator prompt 前置到 system message（此行为干扰双星调度模型，已通过移除 omo-slim 插件消除）
3. **tool hook**：注册自定义工具（webfetch 等）

## omo-slim 使用的全部 Hook

| 钩子 | omo-slim 用途 |
|------|-------------|
| `config` | 注入 agent 定义、MCP、命令、权限规则 |
| `tool` | webfetch / council / cancel_task / acp_run |
| `event` | session 生命周期、multiplexer、companion、depth 追踪 |
| `chat.message` | agent 路由解析、companion 状态更新 |
| `chat.headers` | 自定义 HTTP 头 |
| `chat.params` | 模型参数注入 |
| `experimental.chat.system.transform` | orchestrator prompt 前置 + post-file-tool nudge |
| `experimental.chat.messages.transform` | phase reminder + skill 过滤 + task 管理 + 图片路由 |
| `tool.execute.before` | apply_patch 预处理 + task session 追踪 |
| `tool.execute.after` | post-file-tool nudge 记录 + 委托重试 + JSON 错误恢复 |
| `command.execute.before` | /deepwork / /reflect / /loop / /interview / /preset |
| `permission.ask` | 动态权限决策 |

## 关键发现：orchestrator prompt 注入机制

**代码位置**：`dist/index.js:39457-39468`

```js
"experimental.chat.system.transform": async (input, output) => {
  if (agentName === "orchestrator") {
    output.system[0] = orchestratorPrompt + "\n\n" + output.system[0];
  }
}
```

注入内容（`buildOrchestratorPrompt`，`dist/index.js:19312-19442`）：
- `<Role>` 块：定义 orchestrator 为 "workflow manager"
- `<Agents>` 块：列出 omo agent（explorer/librarian/oracle/designer/fixer/observer）
- `<Workflow>` 块：background task 调度规则
- `<Communication>` 块：通信规范

**与双星的冲突**：omo prompt 在最前面声明"你是 workflow manager"，双星 prompt 在最后面声明"你是主力智能助手"。两个调度模型（background task vs 四阶段）同时存在，干扰对双星实际能力的评估。

## Phase Reminder 注入

**代码位置**：`dist/index.js:26431-26439`

每条用户消息末尾追加以 `<system-reminder>` 包裹的调度指令：

> "Schedule workflow: plan lanes → dispatch background specialists → track task IDs → wait for hook-driven completion → reconcile terminal results → verify"

仅对 orchestrator session 注入。持续强化 omo 调度模型。

## 内置 MCP 服务器

| MCP | URL | 认证 |
|-----|-----|------|
| websearch | `https://mcp.exa.ai/mcp?tools=web_search_exa` | 匿名（有速率限制）/ Exa API Key |
| context7 | `https://mcp.context7.com/mcp` | 可选 `CONTEXT7_API_KEY` |
| gh_grep | `https://mcp.grep.app` | 无 |

配置方式：omo-slim 通过 `config` hook 动态注入 `opencodeConfig.mcp`（`dist/index.js:39325-39330`）。

## 内置 Skills（11 个）

| skill | 用途 |
|-------|------|
| `simplify` | 简化代码不改变行为 |
| `deepwork` | 大规模多阶段编码编排 |
| `codemap` | 生成代码库层级地图 |
| `clonedeps` | 拉取依赖源码到本地 |
| `reflect` | 回顾工作找可复用模式 |
| `verification-planning` | 编码前制定验证计划 |
| `worktrees` | Git worktree 管理 |
| `loop-engineering` | 循环工程模式 |
| `oh-my-opencode-slim` | 配置 omo-slim 自身 |
| `release-smoke-test` | omo-slim 发布前测试 |
| `agent-skill-creator` | 创建跨平台 agent skill |

这些 skill 大部分作为独立文件存在于 `~/.config/opencode/skills/` 和 `~/.claude/skills/` 中，OC 自动发现，移除 omo-slim 插件不影响其可用性。

## webfetch 工具

**不是来自 Exa MCP**，而是 omo-slim 用 `@opencode-ai/plugin` 的 `tool()` API 自建（`dist/index.js:38339`，约 370 行）。

功能远超简单 HTTP GET：
- llms.txt 探测（自动查找站点 AI 友好索引）
- 内容提取管线（JS 静态渲染 → Readability 正文提取 → Turndown HTML→Markdown）
- 二级模型摘要（可选，调用 cheap model 定向提取）
- LRU 缓存
- 权限管理

移除 omo-slim 后 webfetch 不可用。OC 内置 `read` 工具可替代基本 URL 获取。

## agent multiplexer

统一接口对接 tmux / zellij / cmux / herdr 四种终端复用器。当 orchestrator 调度子 agent 时，在**新终端窗格**中打开该 agent session，实现可视化并行。

**对双星无影响**：OC GUI 模式下无终端窗格概念。

## oc-plus 与 omo-slim 能力对照

| omo-slim 能力 | oc-plus 状态 |
|--------------|------------|
| orchestrator prompt 注入 | ❌ 已移除（干扰双星） |
| phase reminder | ❌ 冲突 |
| agent multiplexer | ❌ 不适用 |
| companion manager | ❌ 不适用 |
| council mechanism | ❌ 不适用 |
| task session manager | ❌ 不适用 |
| foreground fallback | ❌ 不适用 |
| agent 定义层 | ✅ 双星自建 |
| MCP 服务器 | ✅ opencode.json 直配 |
| skills | ✅ 独立 skill 文件 |
| 分形 Guardian | ✅ fractal.ts 自建 |
| 编码规范注入 | ✅ agents-priority.ts + AGENTS.md |

## 双星纯净环境配置

移除 omo-slim 后的 `opencode.json` plugin 数组：

```json
"plugin": ["oc-plus-fractal", "agents-priority", "opencode-acp@latest"]
```

MCP 服务器直接配置在 `mcp` 字段：

```json
"mcp": {
  "github": { "url": "https://api.githubcopilot.com/mcp/" },
  "websearch": { "url": "https://mcp.exa.ai/mcp?tools=web_search_exa" },
  "gh_grep": { "url": "https://mcp.grep.app" },
  "context7": { "url": "https://mcp.context7.com/mcp" }
}
```

架构原则：**各司其职、互不侵入**——每层职责清晰，插件之间不互相注入 prompt。
