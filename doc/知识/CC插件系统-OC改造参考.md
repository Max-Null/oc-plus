# CC 插件系统 → OC 改造参考（修正版）

> 生成时间：2026-07-17 | 基于 CC 官方文档 + OC 官方文档 + @opencode-ai/plugin 源码 + DeepWiki 分析
> **修正说明**：初版仅基于自身项目的 2 个插件推测 OC 能力，严重低估。本版基于联网验证的真实 API 接口重写。

---

## 一、总体判断纠正

**初版结论「OC 相较于 CC 太原始」是错误的。** OC 的 Plugin API 实际上非常成熟，只是自身项目（记忆管家 + agents-priority）只用到了冰山一角。

| 判断维度 | 初版（错误） | 修正版 |
|----------|-------------|--------|
| 工具执行前后拦截 | ❌ 缺少 PreToolUse/PostToolUse | ✅ V1 就有 `tool.execute.before` / `tool.execute.after` |
| Hook 入口数量 | 只有 3 个 | ✅ V1 16+ 个，V2 更多 |
| 事件类型 | 不够 | ✅ event hook 30+ 事件类型 |
| Agent 级 skill 绑定 | 缺少 | ✅ 有 per-agent skill 权限 + wildcard |
| 插件生态成熟度 | 刚起步 | ✅ oh-my-opencode 有 53 hooks / 15 tools / 11 agents，已是框架级插件 |

---

## 二、Hook 系统真实对比

### 2.1 OC (OpenCode) Plugin API V1 Hooks 完整清单

来源：`@opencode-ai/plugin` v1.3.3 `Hooks` 接口定义

| Hook | 触发时机 | 可修改 | OC 记忆管家是否在用 |
|------|---------|--------|---------------------|
| `event` | 任意系统事件（30+ 类型） | 只读 | ✅ 记录 message.updated / file.edited |
| `config` | 插件初始化时 | 注入 agents / commands / MCP | ❌ |
| `tool` | 插件加载时 | 注册自定义工具 | ❌ |
| `auth` | 认证初始化时 | 提供 OAuth / API Key 流程 | ❌ |
| `chat.message` | 收到新消息时 | 修改 message + parts | ❌ |
| `chat.params` | LLM 请求前 | 修改 temperature / topP / options | ❌ |
| `chat.headers` | LLM 请求前 | 注入自定义 HTTP headers | ❌ |
| `permission.ask` | 权限请求时 | 设置 allow / deny / ask | ❌ |
| `command.execute.before` | 命令执行前 | 修改 parts | ❌ |
| **`tool.execute.before`** | **工具执行前** | **修改 args 或 throw 阻止** | ❌ **记忆管家未用** |
| **`tool.execute.after`** | **工具执行后** | **修改 output / title / metadata** | ❌ **记忆管家未用** |
| `shell.env` | shell 执行前 | 注入环境变量 | ❌ |
| `experimental.chat.system.transform` | 构建 system prompt 时 | push 到 system 数组 | ✅ 注入 blocks + triggers + 规则 |
| `experimental.chat.messages.transform` | 消息列表变换时 | 修改 messages 数组 | ❌ |
| `experimental.session.compacting` | 压缩前 | push context 或替换 prompt | ✅ 注入记忆防丢失 |
| `experimental.text.complete` | 文本补全后 | 修改 text | ❌ |
| `tool.definition` | 工具定义时 | 修改 description / parameters | ❌ |

### 2.2 OC Plugin API V2（beta）新增

来源：`opencode.ai/docs/plugins/` V2 文档

V2 在 V1 基础上新增了 **Transform Hooks** 和 **Runtime Hooks**：

**Transform Hooks**（修改 OpenCode 配置层）：
- `agent.transform` — 增删改 agent 定义
- `catalog.transform` — 增删改 provider / model
- `command.transform` — 增删改命令
- `integration.transform` — 增删改集成
- `reference.transform` — 增删改引用文件
- `skill.transform` — 增删改 skill 来源
- `tool.transform` — 注册自定义工具

**Runtime Hooks**（拦截运行时操作）：
- `ctx.aisdk.hook("sdk", cb)` — 拦截 AI SDK 调用
- `ctx.aisdk.hook("language", cb)` — 拦截语言模型调用
- `ctx.session.hook("request", cb)` — **在 model dispatch 前直接修改 system / messages / tools**
- `ctx.tool.hook("execute.before", cb)` — 工具执行前拦截（更精确的 V2 版本）
- `ctx.tool.hook("execute.after", cb)` — 工具执行后拦截

**Plugin Context 能力**（比 V1 的 PluginInput 更丰富）：
- `ctx.agent.list/get/transform/reload`
- `ctx.catalog.provider/model.list/get/default`
- `ctx.command.list/transform/reload`
- `ctx.skill.list/transform/reload`
- `ctx.session.create/get/prompt/command/synthetic/interrupt/hook`
- `ctx.tool.transform/hook`
- `ctx.event.subscribe` — 订阅事件流
- `ctx.options` — 读取插件配置

### 2.3 CC Hook 事件 vs OC Event 事件

| 阶段 | CC 事件 | OC 对应（event hook） | 状态 |
|------|---------|----------------------|------|
| 会话生命周期 | SessionStart | `session.created` | ✅ 有对应 |
| | Setup | — | ❌ 无 |
| | SessionEnd | `session.deleted` | ✅ 有对应 |
| 用户输入 | UserPromptSubmit | — | ⚠️ 可用 `chat.message` 近似 |
| | UserPromptExpansion | — | ❌ 无 |
| 工具执行前 | PreToolUse | `tool.execute.before` (hook) + event | ✅ 更灵活 |
| | PermissionRequest | `permission.ask` (hook) | ✅ 有对应 |
| | PermissionDenied | `permission.updated` (event) | ✅ 近似 |
| 工具执行后 | PostToolUse | `tool.execute.after` (hook) + event | ✅ 更灵活 |
| | PostToolUseFailure | — | ❌ 无（可通过 try/catch 兜底） |
| | PostToolBatch | — | ❌ 无 |
| 文件变更 | FileChanged | `file.edited` / `file.watcher.updated` | ✅ 有对应 |
| Agent 协作 | SubagentStart | `tool.execute.before` (tool=task) | ✅ 近似 |
| | SubagentStop | `tool.execute.after` (tool=task) | ✅ 近似 |
| | TeammateIdle | `session.idle` (event) | ✅ 近似 |
| 上下文管理 | PreCompact | `experimental.session.compacting` | ✅ 有对应 |
| | PostCompact | `session.compacted` (event) | ✅ 有对应 |
| | InstructionsLoaded | — | ❌ 无 |
| 通知 | Notification | `tui.toast.show` (event) | ⚠️ 部分 |
| 配置变更 | ConfigChange | — | ❌ 无 |

**结论：OC 事件覆盖度约 75%，差距主要在 SessionSetup、UserPromptExpansion、PostToolUseFailure、ConfigChange 这几个比较窄的场景。**

### 2.4 关键差异：Hook 执行类型

| Hook 类型 | CC | OC | 说明 |
|-----------|----|----|------|
| 进程内回调 | `callback` 类型 | 插件导出函数（默认） | **OC 更自然** — 所有 hook 都是进程内函数 |
| Shell 子进程 | `command` 类型 | ❌ 无 | CC 的特色，适合非 JS 脚本 |
| HTTP 通知 | `http` 类型 | ❌ 无（但 OC 插件可直接 import fetch） | CC 的内置 vs OC 的自由度 |
| LLM 判断 | `prompt` 类型 | ❌ 无（但 OC 插件可调 client） | OC 插件有 client 可自行调 LLM |
| Agent 验证 | `agent` 类型 | ❌ 无 | 复杂验证流程 |

**OC 的进程内回调模式实际上比 CC 的 shell 子进程更高效**——没有序列化开销、没有进程启动延迟。CC 的 command/http/prompt/agent hook 相当于把常见的外部调用模式「内置」了，而 OC 把选择权交给插件开发者（你可以用 fetch、可以调 client、可以自己 spawn）。

---

## 三、记忆管家的改造机会（基于真实 API）

### 3.1 记忆管家当前未使用但已经可用的 Hook

记忆管家目前只用了 3 个 hook：
- `experimental.chat.system.transform` — 注入规则和记忆
- `event` — 记录 message.updated 事件（被动监听）
- `experimental.session.compacting` — 压缩时注入记忆

**已经可用但未使用的关键 Hook：**

#### `tool.execute.after` — 直接替代「注入规则 → 主 agent 理解 → 调助理」的间接路径

```typescript
// 当前（间接）：system.transform 注入硬编码规则
// → 主 agent 理解规则 → 写完文件后主动调 task 工具 → 助理
// 问题：依赖主 agent 记住规则，可能被忽略

// 改用 tool.execute.after（直接）：
"tool.execute.after": async (input, output) => {
  if (input.tool === "write" || input.tool === "edit") {
    // 直接触发回应逻辑，不再依赖 system prompt 注入
    await client.session.prompt({
      path: { id: input.sessionID },
      body: { parts: [{ text: "助理，我刚完成了文件操作，检查一下" }], noReply: true }
    });
  }
}
```

#### `tool.execute.before` — 安全检查

```typescript
"tool.execute.before": async (input, output) => {
  // 阻止危险命令
  if (input.tool === "bash" && output.args?.cmd?.includes("rm -rf")) {
    throw new Error("危险操作被记忆管家阻止");
  }
}
```

#### `chat.message` — 首次消息注入

```typescript
"chat.message": async (input, output) => {
  // 在用户第一条消息时注入上下文，比 system.transform 更早、更可靠
  if (isFirstMessage(input.sessionID)) {
    output.parts[0].text = "[记忆管家上下文]\n" + output.parts[0].text;
  }
}
```

### 3.2 事件丰富度远超当前使用

记忆管家当前 event hook 只记录了 `message.updated`、`file.edited`、`tool.execute.after`。实际上 OC event hook 有 30+ 事件：

```
session.created / deleted / error / idle / compacted / diff / status / updated
message.updated / removed / part.updated / part.removed
tool.execute.before / after
file.edited / watcher.updated
permission.asked / replied / updated
command.executed
lsp.client.diagnostics / updated
todo.updated
shell.env
tui.prompt.append / command.execute / toast.show
installation.updated
server.connected
```

记忆管家可以利用这些做更精细的观测——例如 `session.idle` 判断主 agent 是否空闲、`lsp.client.diagnostics` 感知代码错误。

---

## 四、Skill 系统真实对比

### 4.1 OC 的 Skill 能力（初版低估的部分）

| 能力 | CC | OC | 说明 |
|------|----|----|------|
| SKILL.md 结构 | ✅ | ✅ | 完全兼容 |
| 多位置发现 | ✅ .claude + plugin | ✅ .opencode + .claude + .agents + plugin config.skills.paths | 来源更多 |
| 权限控制 | ✅ | ✅ allow/deny/ask + glob pattern | 同等 |
| Per-agent 权限覆盖 | ❓ | ✅ 明确支持 | OC 更灵活 |
| 命名空间 | ✅ `/plugin:skill` | ✅ opencode-claude-bridge 支持 `namespace/name` + collision fallback | 兼容方案 |
| 渐进式加载 | ✅ metadata→core→references | ✅ 原生 skill tool 自动加载 | 同等 |
| CC 兼容 | — | ✅ `.claude/skills/` 原生读取 + opencode-claude-bridge 桥接 | **OC 能直接读 CC 的 skill** |
| 模型可见性控制 | `disable-model-invocation` | ✅ 同名字段支持 | 兼容 |
| 用户可调性控制 | `user-invocable` | ✅ 同名字段支持 | 兼容 |

**OC 的 skill 系统至少和 CC 同级，而且在 CC 兼容性上做得更多。**

---

## 五、Agent 系统真实对比

| 配置项 | CC | OC |
|--------|----|----|
| model | ✅ | ✅ |
| description | ✅ | ✅ |
| mode（primary/subagent） | ✅ | ✅ + `all` + `hidden` |
| system prompt | ✅ body + prompt 字段 | ✅ frontmatter body + `prompt` 文件引用 |
| permission / tools | ✅ tools + disallowedTools | ✅ **更细粒度**：read/edit/glob/grep/bash/task/external_directory/todowrite/webfetch/websearch/lsp/skill/question |
| Task 权限（控制调哪些子 agent） | ❓ | ✅ `permission.task` + glob 匹配 |
| Skill 权限（per-agent） | ❓ | ✅ `permission.skill` + glob 匹配 |
| MCP 工具权限 | ❓ | ✅ 通配符匹配 `mymcp_*` |
| effort | ✅ | ❌ |
| maxTurns | ✅ | ❌ |
| background | ✅ | ❌（但 oh-my-opencode 实现了 background-agent） |
| isolation（worktree） | ✅ | ❌ |
| color（TUI 显示色） | ❌ | ✅ |
| compaction agent | ✅ 独立配置 | ✅ 独立配置 |

---

## 六、MCP 集成对比

| 维度 | CC | OC |
|------|----|----|
| 配置位置 | `.mcp.json` / plugin.json inline / skill frontmatter `mcp:` | `opencode.json` mcp 字段 / config hook 注入 |
| 传输类型 | stdio / SSE / HTTP / WebSocket | local (stdio) / remote (SSE/HTTP) |
| OAuth 支持 | ✅ | ✅（oh-my-opencode 的 mcp-oauth 模块） |
| 插件级 MCP | ✅ | ✅ config hook 可注入 |
| Per-agent MCP 权限 | ❓ | ✅ 通配符 `mymcp_*` |
| CC `.mcp.json` 兼容 | — | ✅ opencode-claude-bridge 自动翻译 |
| 嵌入式 MCP（skill 内） | ✅ | ✅ opencode-claude-bridge 解析 `mcp:` block |

---

## 七、真正值得关注的差距

经过验证，OC 和 CC 在核心扩展能力上**基本同级**。真正有意义的差距在以下几项：

### 7.1 OC 领先的领域

| 领域 | 说明 |
|------|------|
| **Hook 执行效率** | 进程内回调 vs CC 的 shell 子进程，零序列化开销 |
| **权限粒度** | permission 的 13 个维度 + wildcard + per-agent 覆盖，比 CC 更细 |
| **CC 兼容性** | 原生读取 `.claude/skills/`、`.claude/agents/`、`.mcp.json`，bridge 插件还能桥接 CC 的 plugin |
| **Plugin 能力天花板** | oh-my-opencode 证明可以构建框架级插件（53 hooks / 15 tools / 11 agents） |
| **Agent 协作协议** | 原生 ACP（Agent Client Protocol）+ Slack 集成 + GitHub Action |
| **V2 API** | Transform hooks 允许插件直接操作配置层，比 CC 的 manifest 声明式更灵活 |

### 7.2 CC 领先的领域

| 领域 | CC | OC 差距 |
|------|----|---------|
| **maxTurns**（防死循环） | ✅ agent 级配置 | ❌ |
| **effort**（推理深度控制） | ✅ low/medium/high | ❌ |
| **background agent**（原生） | ✅ agent 级配置 | ❌（oh-my-opencode 插件实现） |
| **worktree isolation** | ✅ 安全沙箱 | ❌ |
| **后台 Monitor**（主动监控） | ✅ monitors.json | ❌（但 OC 插件可自己写 while loop） |
| **Marketplace 分发** | ✅ `/plugin install` | ❌（npm 包分发够用但不等于 marketplace） |
| **企业策略** | ✅ Managed settings + allowManagedHooksOnly | ❌ |

### 7.3 设计哲学差异

| 维度 | CC | OC |
|------|----|----|
| 插件执行环境 | 外部进程（安全隔离） | 进程内（高效、共享状态） |
| 配置风格 | 声明式（JSON manifest） | 编程式（TypeScript 函数） |
| Hook 模型 | 事件驱动 + 进程通信 | 管道式 (input, output) → 原地修改 |
| 扩展自由度 | 受限于声明式 schema | **完全自由** — 你可以 import 任何 npm 包 |

OC 的编程式插件模型给了插件开发者极大的自由——你可以 import 任何 npm 包、调任何 API、做任意复杂的逻辑。CC 的声明式更像「配置一个框架」，而 OC 的编程式更像「写一个应用」。

---

## 八、记忆管家的实际改造路径

基于已验证的 API，记忆管家可以立即做这些改造：

### P0（今天就能做）— 可用 hook 替换间接路径

```diff
// 当前：system.transform 注入硬编码规则
+ "tool.execute.after": async (input, output) => {
+   if (["write", "edit"].includes(input.tool)) {
+     // 直接触发回应逻辑，不依赖主 agent "记住"规则
+   }
+ }

// 当前：event hook 只记录 message.updated
+ 监听 session.idle → 主 agent 空闲时触发分析
+ 监听 session.compacted → 全量注入记忆（替换现有 compacting hook）
+ 监听 lsp.client.diagnostics → 感知代码质量
```

### P1（需要设计决策）

- `config` hook 动态注入 agents/commands/MCP，替代手动部署步骤
- `permission.ask` 接管权限审批，实现记忆驱动的自动批准
- `tool` hook 注册「记忆查询」自定义工具，替代硬编码注入

### P2（OC 原生不支持，需插件层实现）

- maxTurns 限制 → 在 `tool.execute.before` 中计次，超限 throw 阻止
- background agent → 参考 oh-my-opencode 的 background-agent 模式
- 主动 Monitor → 插件内 while loop + 定时检查

---

## 九、结论

1. **OC Plugin API 不「原始」，正好相反**——16+ hooks、30+ 事件、V2 的 Transform 层，以及 oh-my-opencode 这个 53-hook 的框架级插件，证明了它的成熟度。

2. **记忆管家的改造空间巨大，但不是因为 OC 缺能力，而是因为自身只用了 3/16 的 hook**。`tool.execute.after` 已经在 API 里躺着，只需要加几行代码就能从「间接注入」升级到「直接响应」。

3. **CC vs OC 在插件系统层面是各有优势的对等关系**，不是碾压。OC 在编程自由度、权限粒度、CC 兼容性上甚至更强。CC 在企业策略和市场分发上领先。

4. **设计哲学不同**：CC 是声明式配置框架，插件是「被管理的模块」；OC 是编程式扩展平台，插件是「平等的应用代码」。两者没有优劣，取决于场景。
