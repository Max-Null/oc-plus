<!-- type: knowledge --><!-- status: auto --><!-- description: OC Plugin API V1 完整 Hooks 接口和可用事件速查表 -->
## OC Plugin API — Hooks 完整清单

事实：`@opencode-ai/plugin` V1 Hooks 接口定义了 16+ 个 hook 入口，event hook 有 30+ 事件类型。
原则：设计插件时先对照此清单确认能力边界，不要从现有插件代码反推。

### V1 Hooks（已稳定）
`tool.execute.before` — 工具执行前拦截（可改 args 或 throw 阻止）
`tool.execute.after` — 工具执行后处理（可改 output/title/metadata）
`permission.ask` — 权限决策（设置 allow/deny/ask）
`chat.message` — 首条消息注入（比 system.transform 更早）
`chat.params` — 修改 LLM 参数
`chat.headers` — 注入 HTTP 头
`config` — 注入 agents/commands/MCP
`tool` — 注册自定义工具
`auth` — 自定义 OAuth/API Key 认证
`event` — 全局事件监听（30+ 类型）
`command.execute.before` — 命令执行前拦截
`shell.env` — 注入 shell 环境变量
`experimental.chat.system.transform` — 修改 system prompt
`experimental.chat.messages.transform` — 变换消息列表
`experimental.session.compacting` — 压缩时注入上下文
`experimental.text.complete` — 文本补全后处理
`tool.definition` — 修改工具定义

### key 事件（event hook 可用）
session: created/deleted/error/idle/compacted/diff/status/updated
message: updated/removed/part.updated/part.removed
tool: execute.before/after
file: edited/watcher.updated
permission: asked/replied/updated
command: executed
lsp: client.diagnostics/updated
todo: updated
tui: prompt.append/command.execute/toast.show

结论：OC Plugin API 不原始——记忆管家只用了 4/16 hook，剩余能力全在 API 里躺着。
